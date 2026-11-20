package llm

import (
	"flai/internal/consts"
	"flai/internal/logic"
	"math"
	"testing"
)

func TestRecordUsageSeparatesCacheAndProviderTokenCounts(t *testing.T) {
	input, output, cache, longInput, search := 2.5, 10.0, 0.0, 5.0, 0.01
	model := &logic.ModelConfig{Cost: &logic.Cost{
		Input: &input, Output: &output, CacheRead: &cache, WebSearch: &search,
		ContextOver200K: &logic.Cost{Input: &longInput, Output: &output},
	}}

	meta := MessageMetaInfo{PromptTokenCount: 30_400, CachedTokenCount: 12_000, ResponseTokenCount: 6_400, ReasoningTokenCount: 900}
	meta.RecordUsage(model, consts.ProviderType.OpenAI, true, []ToolUsage{{Name: consts.InternalTools.WebSearch, Calls: 3}})
	first := meta.Usage[0]
	if first.Input.Tokens != 18_400 || first.CacheRead.Tokens != 12_000 || first.Output.Tokens != 6_400 {
		t.Fatalf("input cache or output reasoning counted twice: %+v", first)
	}
	for name, charge := range map[string]struct {
		actual   *float64
		expected float64
	}{
		"input": {first.Input.USD, 0.046}, "output": {first.Output.USD, 0.064},
		"free cache": {first.CacheRead.USD, 0}, "web search": {first.Tools[0].USD, 0.03},
	} {
		if charge.actual == nil || math.Abs(*charge.actual-charge.expected) > 1e-10 {
			t.Errorf("%s amount = %v, expected %v", name, charge.actual, charge.expected)
		}
	}

	meta.PromptTokenCount = 212_000
	meta.ToolUseTokenCount = 1_800
	meta.RecordUsage(model, consts.ProviderType.Gemini, true, nil)
	second := meta.Usage[1]
	if second.Input.USD == nil || *second.Input.USD != 1 ||
		second.Output.Tokens != 7_300 || second.ToolInput.Tokens != 1_800 ||
		second.ToolInput.USD == nil || math.Abs(*second.ToolInput.USD-0.009) > 1e-10 ||
		second.CacheRead.USD != nil {
		t.Fatalf("Gemini round didn't apply the right context tier, thinking, tool input or missing cache rates: %+v", second)
	}

	meta.RecordUsage(model, consts.ProviderType.Gemini, false, nil)
	if missing := meta.Usage[2]; !missing.Incomplete || missing.Input.Tokens != 0 || missing.Output.Tokens != 0 {
		t.Fatalf("missing report reused tokens from the previous round: %+v", missing)
	}
}
