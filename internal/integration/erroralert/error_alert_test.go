package erroralert

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	adminv1 "flai/api/admin/v1"
	messagev1 "flai/api/message/v1"
	"flai/internal/consts"
	"flai/internal/controller/admin"
	"flai/internal/logic"
	"flai/internal/logic/llm"
	"flai/internal/model/entity"
	"flai/internal/testutil"
)

type barkTestTransport func(*http.Request) (*http.Response, error)

func (f barkTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestErrorAlertSettingsAndDelivery(t *testing.T) {
	db := testutil.Database(t)
	ctx := context.Background()
	controller := admin.NewV1()
	settings, err := controller.ErrorAlertGet(ctx, &adminv1.ErrorAlertGetReq{})
	if err != nil || settings.BarkURL != "" {
		t.Fatalf("alerts should default to disabled: %v %v", settings, err)
	}
	for _, invalid := range []string{"device-test", "ftp://bark.example.test/key", "https:///key", "https://bark.example.test/key#fragment", "https://user:pass@bark.example.test/key", "https://bark.example.test/bad key"} {
		if _, err := controller.ErrorAlertUpdate(ctx, &adminv1.ErrorAlertUpdateReq{BarkURL: invalid}); err == nil {
			t.Fatalf("invalid URL should be rejected: %s", invalid)
		}
	}
	const endpoint = "http://bark.example.test:8080/notify/device-test?sound=bell"
	if _, err := controller.ErrorAlertUpdate(ctx, &adminv1.ErrorAlertUpdateReq{BarkURL: " " + endpoint + " "}); err != nil {
		t.Fatal(err)
	}
	settings, err = controller.ErrorAlertGet(ctx, &adminv1.ErrorAlertGetReq{})
	if err != nil || settings.BarkURL != endpoint {
		t.Fatalf("settings were not saved: %v %v", settings, err)
	}

	original := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = original })
	alerts := make(chan map[string]string, 10)
	http.DefaultTransport = barkTestTransport(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host != "bark.example.test:8080" {
			return original.RoundTrip(req)
		}
		if req.URL.String() != endpoint {
			t.Errorf("configured push URL was changed: %s", req.URL)
		}
		var payload map[string]string
		if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
			return nil, err
		}
		alerts <- payload
		// A Bark failure must not replace the original LLM error.
		return &http.Response{StatusCode: 500, Body: io.NopCloser(strings.NewReader(`{}`)), Request: req}, nil
	})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"message":"upstream rejected secret-key","code":400}}`)
	}))
	defer upstream.Close()
	provider := &logic.SimpleProviderInfo{Name: "Test provider", ProviderType: consts.ProviderType.OpenAI, BaseUrl: upstream.URL + "/", ApiKey: "secret-key"}
	model := &logic.ModelConfig{ID: "test-model"}
	message := &entity.Message{Content: `[{"type":"message","data":{"content":"private prompt"}}]`}
	oldConfig := logic.SystemConfigMap
	t.Cleanup(func() { logic.SystemConfigMap = oldConfig })
	logic.SystemConfigMap = map[string]map[string]any{
		consts.SystemConfig.TitleGeneration: {"provider_id": "alert-provider", "model_name": model.ID, "prompt": "generate a title"},
	}
	for _, providerType := range []string{consts.ProviderType.OpenAI, consts.ProviderType.OpenAICompletion, consts.ProviderType.Gemini} {
		provider.ProviderType = providerType
		if _, err := db.Exec(ctx, `INSERT INTO provider (id, name, provider_type, base_url, api_key, model, is_active) VALUES ('alert-provider', 'Test provider', $1, $2, 'secret-key', '[{"id":"test-model"}]', 1) ON CONFLICT (id) DO UPDATE SET provider_type = EXCLUDED.provider_type`, providerType, provider.BaseUrl); err != nil {
			t.Fatal(err)
		}
		if err := logic.UpdateProviderCache(ctx); err != nil {
			t.Fatal(err)
		}
		for _, operation := range []string{"聊天", "翻译", "标题生成"} {
			if operation == "聊天" {
				err = llm.StreamChat(ctx, &messagev1.CreateReq{AssistantMessageId: "test"}, func(any) error { return nil }, provider, model, nil, message, nil, nil)
			} else if operation == "翻译" {
				err = llm.StreamTranslate(ctx, func(any) error { return nil }, provider, model, "private prompt", nil)
			} else {
				_, err = llm.GenerateTitle(ctx, nil, "private prompt")
			}
			if err == nil || !strings.Contains(err.Error(), "upstream rejected") {
				t.Fatalf("original LLM error lost: %v", err)
			}
			select {
			case payload := <-alerts:
				body := payload["body"]
				if payload["device_key"] != "" || !strings.Contains(body, operation) || !strings.Contains(body, model.ID) || !strings.Contains(body, "[redacted]") || strings.Contains(body, provider.ApiKey) || strings.Contains(body, "private prompt") {
					t.Fatalf("unexpected alert: %v", payload)
				}
			case <-time.After(3 * time.Second):
				t.Fatal("alert not sent")
			}
		}
	}
	expired, expire := context.WithDeadline(ctx, time.Now().Add(-time.Second))
	defer expire()
	llm.StreamTranslate(expired, func(any) error { return nil }, provider, model, "timeout", nil)
	select {
	case payload := <-alerts:
		if !strings.Contains(payload["body"], "deadline exceeded") {
			t.Fatalf("unexpected timeout alert: %v", payload)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed-out request prevented alert delivery")
	}

	canceled, cancel := context.WithCancel(ctx)
	cancel()
	llm.StreamTranslate(canceled, func(any) error { return nil }, provider, model, "cancel", nil)
	if _, err := controller.ErrorAlertUpdate(ctx, &adminv1.ErrorAlertUpdateReq{}); err != nil {
		t.Fatal(err)
	}
	llm.StreamTranslate(ctx, func(any) error { return nil }, provider, model, "disabled", nil)
	select {
	case payload := <-alerts:
		t.Fatalf("unexpected alert for success, cancellation, or disabled settings: %v", payload)
	case <-time.After(100 * time.Millisecond):
	}
}
