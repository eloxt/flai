package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"flai/internal/logic"
	"flai/internal/model/entity"
)

type barkTestTransport func(*http.Request) (*http.Response, error)

func (f barkTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestSendBarkAlert(t *testing.T) {
	original := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = original })
	for _, endpoint := range []string{"https://api.day.app/device-test", "http://bark.example.test:8080/device-test", "https://bark.example.test/notify/device-test?sound=bell"} {
		for _, test := range []struct {
			name   string
			status int
			body   string
			fail   bool
		}{
			{"success", 200, `{"code":200}`, false},
			{"http failure", 500, `{"code":500}`, true},
			{"device rejected", 200, `{"code":400}`, true},
			{"invalid response", 200, `not json`, true},
			{"missing code", 200, `{}`, true},
			{"redirect", 307, ``, true},
		} {
			t.Run(endpoint+"/"+test.name, func(t *testing.T) {
				http.DefaultTransport = barkTestTransport(func(req *http.Request) (*http.Response, error) {
					if req.Method != http.MethodPost || req.URL.String() != endpoint || req.Header.Get("Content-Type") != "application/json" {
						t.Errorf("unexpected Bark request: %s %s", req.Method, req.URL)
					}
					var payload map[string]string
					if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
						t.Fatal(err)
					}
					if payload["device_key"] != "" || payload["body"] != "报错 & / ?" || payload["title"] == "" || payload["group"] != "Flai" {
						t.Errorf("unexpected payload: %v", payload)
					}
					return &http.Response{StatusCode: test.status, Header: http.Header{"Location": {"https://other.test"}}, Body: io.NopCloser(strings.NewReader(test.body)), Request: req}, nil
				})
				err := sendBarkAlert(context.Background(), endpoint, "报错 & / ?")
				if (err != nil) != test.fail {
					t.Fatalf("unexpected result: %v", err)
				}
			})
		}
	}
	t.Run("deadline", func(t *testing.T) {
		http.DefaultTransport = barkTestTransport(func(req *http.Request) (*http.Response, error) {
			<-req.Context().Done()
			return nil, req.Context().Err()
		})
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
		defer cancel()
		if err := sendBarkAlert(ctx, "https://api.day.app/device-test", "timeout"); !errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "device-test") {
			t.Fatalf("expected deadline, got %v", err)
		}
	})
}

func TestErrorAlertIgnoresSuccessAndCancellation(t *testing.T) {
	ctx := context.Background()
	notifyError(ctx, "success", nil, nil, nil)
	notifyError(ctx, "cancel", nil, nil, fmt.Errorf("wrapped: %w", context.Canceled))
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	notifyError(canceled, "cancel", nil, nil, errors.New("no content"))
}

func TestOpenAIStreamFailureEvents(t *testing.T) {
	for _, event := range []string{
		`{"type":"response.failed","response":{"error":{"code":"server_error","message":"stream failed"}}}`,
		`{"type":"error","code":"server_error","message":"stream failed"}`,
	} {
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = fmt.Fprintf(w, "data: %s\n\n", event)
		}))
		provider := &logic.SimpleProviderInfo{BaseUrl: upstream.URL + "/", ApiKey: "test"}
		client := &OpenAIClient{}
		model := &logic.ModelConfig{ID: "test-model"}
		message := &entity.Message{Content: `[{"type":"message","data":{"content":"hello"}}]`}
		chatErr := client.StreamChat(context.Background(), "test", func(any) error { return nil }, provider, model, nil, message, nil, nil, nil, "")
		translateErr := client.StreamTranslate(context.Background(), func(any) error { return nil }, provider, model, "hello", nil)
		upstream.Close()
		for _, err := range []error{chatErr, translateErr} {
			if err == nil || !strings.Contains(err.Error(), "stream failed") {
				t.Fatalf("stream error was swallowed: %v", err)
			}
		}
	}
}
