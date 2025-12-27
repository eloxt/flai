package llm

import "google.golang.org/genai"

type StreamResponse struct {
	MessageId string `json:"message_id"`
	Type      string `json:"type"`
	Data      any    `json:"data"`
}

type ContentReasoning struct {
	Content string `json:"content"`
}

type ContentMessage struct {
	Content string `json:"content"`
}

type Content struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type TitleGenerationResponse struct {
	Icon  string `json:"icon"`
	Title string `json:"title"`
}

type MessageMetaInfo struct {
	ProviderName        string                   `json:"provider_name"`
	ModelName           string                   `json:"model_name"`
	PromptTokenCount    int                      `json:"prompt_token_count"`
	ReasoningTokenCount int                      `json:"reasoning_token_count"`
	ResponseTokenCount  int                      `json:"response_token_count"`
	ToolUseTokenCount   int                      `json:"tool_use_token_count"`
	CachedTokenCount    int                      `json:"cached_token_count"`
	ThoughtSignature    string                   `json:"thought_signature"`
	GoogleGroundingData *genai.GroundingMetadata `json:"google_grounding_data,omitempty"`
}
