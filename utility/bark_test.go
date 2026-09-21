package utility

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type barkTestTransport func(*http.Request) (*http.Response, error)

func (f barkTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestSendBark(t *testing.T) {
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
					if payload["device_key"] != "" || payload["body"] != "报错 & / ?" || payload["title"] != "Flai 用户反馈" || payload["group"] != "Flai" {
						t.Errorf("unexpected payload: %v", payload)
					}
					return &http.Response{StatusCode: test.status, Header: http.Header{"Location": {"https://other.test"}}, Body: io.NopCloser(strings.NewReader(test.body)), Request: req}, nil
				})
				err := SendBark(context.Background(), endpoint, "Flai 用户反馈", "报错 & / ?")
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
		if err := SendBark(ctx, "https://api.day.app/device-test", "Flai 用户反馈", "timeout"); !errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "device-test") {
			t.Fatalf("expected deadline, got %v", err)
		}
	})
}
