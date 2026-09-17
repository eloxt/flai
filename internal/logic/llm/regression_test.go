package llm

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"flai/internal/consts"
	"flai/internal/logic"
	"flai/internal/model/entity"
	"flai/internal/testutil"
	"google.golang.org/genai"
)

func TestChatCompletionsAttachmentsAndEmptyResults(t *testing.T) {
	client := &OpenAIChatClient{}
	file := &entity.File{Id: "image", MimeType: "image/png", PublicUrl: "https://example.test/input.png"}
	msg := &entity.Message{Id: "user", Content: `[{"type":"message","data":{"content":"describe"}}]`}
	history := &entity.Message{Role: "assistant", Content: `[{"type":"message","data":{"content":"generated","images":[{"public_url":"https://example.test/generated.png"}]}}]`}
	messages, err := client.buildMessages([]*entity.Message{history}, msg, []*entity.File{file})
	if err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(messages)
	for _, expected := range []string{file.PublicUrl, "https://example.test/generated.png", "image_url"} {
		if !strings.Contains(string(data), expected) {
			t.Fatalf("missing %s in %s", expected, data)
		}
	}
	file.MimeType = "application/pdf"
	if _, err := client.buildMessages(nil, msg, []*entity.File{file}); err == nil {
		t.Fatal("unsupported attachment silently discarded")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()
	provider := &logic.SimpleProviderInfo{BaseUrl: server.URL + "/", ApiKey: "test"}
	err = client.StreamChat(context.Background(), "assistant", func(any) error { return nil }, provider, &logic.ModelConfig{ID: "test"}, nil, msg, nil, nil, nil, "")
	if err == nil {
		t.Fatal("empty completion accepted")
	}
	if title, err := (&GeminiClient{}).parseTitleResponse(&genai.GenerateContentResponse{}); err == nil || title != nil {
		t.Fatal("empty Gemini title accepted")
	}
}

func TestImageOnlyPersistenceAndSaveFailure(t *testing.T) {
	db := testutil.Database(t)
	ctx := context.Background()
	msg := &entity.Message{Id: "image-only", ConversationId: "conversation", ParentId: "user", Role: "assistant"}
	var text strings.Builder
	var contents []Content
	images := []ContentImage{{PublicUrl: "https://example.test/result.png"}}
	if err := (&GeminiClient{}).saveAndClose(ctx, msg, images, "", &text, "", &contents, MessageMetaInfo{}); err != nil {
		t.Fatal(err)
	}
	value, err := db.GetValue(ctx, `SELECT content FROM message WHERE id='image-only'`)
	if err != nil || !strings.Contains(value.String(), images[0].PublicUrl) {
		t.Fatalf("image not saved: %v %v", value, err)
	}
	if err := SaveAssistantMessage(ctx, msg, contents, MessageMetaInfo{}); err == nil {
		t.Fatal("duplicate insert reported success")
	}
	// Cancellation must still persist partial output using a bounded independent context.
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	text.WriteString("partial")
	msg.Id = "partial"
	handled, err := HandleStreamError(canceled, msg, nil, "", &text, consts.MessageType.Message, &contents, MessageMetaInfo{})
	if !handled || err != nil {
		t.Fatalf("canceled output not saved: %v", err)
	}
}

func TestMinimalThinkingIsForwarded(t *testing.T) {
	for _, providerType := range []string{consts.ProviderType.OpenAI, consts.ProviderType.Gemini} {
		t.Run(providerType, func(t *testing.T) {
			bodies := make(chan string, 4)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body, _ := io.ReadAll(r.Body)
				bodies <- string(body)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(400)
				_, _ = w.Write([]byte(`{"error":{"message":"test rejection","code":400}}`))
			}))
			defer server.Close()
			client, err := NewClient(providerType)
			if err != nil {
				t.Fatal(err)
			}
			msg := &entity.Message{Id: "user", Content: `[{"type":"message","data":{"content":"hi"}}]`}
			err = client.StreamChat(context.Background(), "assistant", func(any) error { return nil }, &logic.SimpleProviderInfo{BaseUrl: server.URL + "/", ApiKey: "test"}, &logic.ModelConfig{ID: "model", Reasoning: true}, nil, msg, nil, nil, nil, "minimal")
			if err == nil {
				t.Fatal("expected test rejection")
			}
			select {
			case body := <-bodies:
				if !strings.Contains(strings.ToLower(body), "minimal") {
					t.Fatalf("minimal reasoning missing: %s", body)
				}
			default:
				t.Fatal("upstream not contacted")
			}
		})
	}
}
