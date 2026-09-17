package systemconfig

import (
	"context"
	"fmt"
	"sync"
	"testing"

	v1 "flai/api/admin/v1"
	"flai/internal/consts"
	"flai/internal/controller/admin"
	"flai/internal/logic"
	"flai/internal/logic/llm"
	"flai/internal/testutil"
)

func TestSystemConfigSettingsAndCache(t *testing.T) {
	db := testutil.Database(t)
	ctx := context.Background()
	c := admin.NewV1()
	result, err := c.SystemConfigGet(ctx, &v1.SystemConfigGetReq{Key: consts.SystemConfig.SystemPrompt})
	if err != nil || result.Value == nil || len(result.Value) != 0 {
		t.Fatalf("missing config: %v %v", result, err)
	}
	if err := logic.SaveSystemConfigToDB(ctx, consts.SystemConfig.SystemPrompt, map[string]any{"prompt": "old", "translate": "old", "future": "preserve"}); err != nil {
		t.Fatal(err)
	}
	value := map[string]any{"prompt": "new {{currentDateTime}}", "translate": "Translate {{text}}"}
	if _, err := c.SystemConfigUpdate(ctx, &v1.SystemConfigUpdateReq{Key: consts.SystemConfig.SystemPrompt, Value: value}); err != nil {
		t.Fatal(err)
	}
	stored, err := logic.GetSystemConfigFromDB(ctx, consts.SystemConfig.SystemPrompt)
	if err != nil || stored["future"] != "preserve" || stored["translate"] != value["translate"] {
		t.Fatalf("saved value: %v %v", stored, err)
	}
	if prompt := llm.ComposeSystemPrompt(); len(prompt) < 10 || prompt[:4] != "new " || prompt == value["prompt"] {
		t.Fatalf("stale/unexpanded prompt: %s", prompt)
	}
	value["prompt"] = "mutated"
	if logic.GetSystemConfig(consts.SystemConfig.SystemPrompt)["prompt"] == "mutated" {
		t.Fatal("cache aliases caller's map")
	}
	for _, req := range []*v1.SystemConfigUpdateReq{
		{Key: "unknown", Value: value},
		{Key: consts.SystemConfig.SystemPrompt, Value: map[string]any{"prompt": 3, "translate": "valid"}},
		{Key: consts.SystemConfig.SystemPrompt, Value: map[string]any{"prompt": "valid", "translate": " "}},
		{Key: consts.SystemConfig.TitleGeneration, Value: map[string]any{"provider_id": "missing", "model_name": "model", "prompt": "title"}},
	} {
		if _, err := c.SystemConfigUpdate(ctx, req); err == nil {
			t.Fatalf("accepted invalid config: %v", req)
		}
	}
	if _, err := db.Exec(ctx, `INSERT INTO provider (id, name, api_key, provider_type, model, is_active) VALUES ('p', 'P', 'test-key', 'openai', '[{"id":"m"}]', 1)`); err != nil {
		t.Fatal(err)
	}
	if err := logic.UpdateProviderCache(ctx); err != nil {
		t.Fatal(err)
	}
	title := map[string]any{"provider_id": "p", "model_name": "m", "prompt": "Generate title"}
	if _, err := c.SystemConfigUpdate(ctx, &v1.SystemConfigUpdateReq{Key: consts.SystemConfig.TitleGeneration, Value: title}); err != nil {
		t.Fatal(err)
	}
	if logic.GetSystemConfig(consts.SystemConfig.TitleGeneration)["model_name"] != "m" {
		t.Fatal("title cache not refreshed")
	}

	// Full reloads and saves must not race with prompt readers.
	var workers sync.WaitGroup
	for i := 0; i < 4; i++ {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			for j := 0; j < 10; j++ {
				if i == 0 {
					if err := logic.UpdateSystemConfigCache(ctx); err != nil {
						t.Error(err)
					}
				} else {
					if err := logic.SaveSystemConfigToDB(ctx, "concurrent", map[string]any{"prompt": fmt.Sprint(i, j)}); err != nil {
						t.Error(err)
					}
				}
				_ = llm.ComposeSystemPrompt()
				_ = logic.GetSystemConfig("concurrent")["prompt"]
			}
		}(i)
	}
	workers.Wait()
	stored, err = logic.GetSystemConfigFromDB(ctx, "concurrent")
	if err != nil || stored["prompt"] != logic.GetSystemConfig("concurrent")["prompt"] {
		t.Fatalf("cache diverged from DB: %v %v", stored, err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if err := logic.SaveSystemConfigToDB(canceled, "concurrent", map[string]any{"prompt": "should not publish"}); err == nil {
		t.Fatal("canceled write succeeded")
	}
	if logic.GetSystemConfig("concurrent")["prompt"] != stored["prompt"] {
		t.Fatal("failed write changed cache")
	}
}
