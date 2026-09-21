package llm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"flai/internal/logic"
	"flai/internal/model/entity"
)

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
