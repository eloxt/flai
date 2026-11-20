package llm

import (
	"flai/internal/consts"
	"flai/internal/logic"
)

type UsageCharge struct {
	Tokens int      `json:"tokens"`
	USD    *float64 `json:"usd,omitempty"`
}

type ToolUsage struct {
	Name  string   `json:"name"`
	Calls int      `json:"calls,omitempty"`
	USD   *float64 `json:"usd,omitempty"`
}

type UsageRound struct {
	Input      UsageCharge `json:"input"`
	Output     UsageCharge `json:"output"`
	CacheRead  UsageCharge `json:"cache_read"`
	ToolInput  UsageCharge `json:"tool_input"`
	Tools      []ToolUsage `json:"tools,omitempty"`
	Incomplete bool        `json:"incomplete,omitempty"`
}

// RecordUsage snapshots one model request at the rates in effect when it ran.
// The original counters remain the latest request's usage for message info.
func (meta *MessageMetaInfo) RecordUsage(model *logic.ModelConfig, providerType string, reported bool, tools []ToolUsage) {
	var rates logic.Cost
	var webSearchPrice *float64
	if model != nil && model.Cost != nil {
		rates = *model.Cost
		webSearchPrice = rates.WebSearch
		if meta.PromptTokenCount > 200_000 && rates.ContextOver200K != nil {
			rates = *rates.ContextOver200K
		}
	}

	charge := func(tokens int, rate *float64) UsageCharge {
		item := UsageCharge{Tokens: max(0, tokens)}
		if item.Tokens > 0 && rate != nil && *rate >= 0 {
			usd := float64(item.Tokens) * (*rate / 1_000_000)
			item.USD = &usd
		}
		return item
	}

	for i := range tools {
		tool := &tools[i]
		if providerType == consts.ProviderType.OpenAI && tool.Name == consts.InternalTools.WebSearch &&
			tool.Calls > 0 && webSearchPrice != nil && *webSearchPrice >= 0 {
			usd := float64(tool.Calls) * *webSearchPrice
			tool.USD = &usd
		}
	}

	round := UsageRound{Tools: tools, Incomplete: !reported}
	if reported {
		output := meta.ResponseTokenCount
		if providerType == consts.ProviderType.Gemini {
			output += meta.ReasoningTokenCount
		}
		cached := min(max(0, meta.CachedTokenCount), max(0, meta.PromptTokenCount))
		round.Input = charge(meta.PromptTokenCount-cached, rates.Input)
		round.CacheRead = charge(cached, rates.CacheRead)
		round.Output = charge(output, rates.Output)
		round.ToolInput = charge(meta.ToolUseTokenCount, rates.Input)
	}
	meta.Usage = append(meta.Usage, round)
}
