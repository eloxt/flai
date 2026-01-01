package llm

import (
	"flai/internal/model/entity"

	"github.com/openai/openai-go/v3/responses"
	"google.golang.org/genai"
)

type StreamResponse struct {
	MessageId string `json:"message_id"`
	Type      string `json:"type"`
	Data      any    `json:"data"`
}

type ContentReasoning struct {
	Content string `json:"content"`
}

type ContentMessage struct {
	Content string         `json:"content"`
	Files   []*entity.File `json:"files"`
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
	ProviderName        string                                        `json:"provider_name"`
	ModelName           string                                        `json:"model_name"`
	PromptTokenCount    int                                           `json:"prompt_token_count"`
	ReasoningTokenCount int                                           `json:"reasoning_token_count"`
	ResponseTokenCount  int                                           `json:"response_token_count"`
	ToolUseTokenCount   int                                           `json:"tool_use_token_count"`
	CachedTokenCount    int                                           `json:"cached_token_count"`
	ThoughtSignature    string                                        `json:"thought_signature"`
	GoogleGroundingData *genai.GroundingMetadata                      `json:"google_grounding_data,omitempty"`
	OpenaiGroundingData []responses.ResponseOutputTextAnnotationUnion `json:"openai_grounding_data,omitempty"`
}

// MCPToolCall represents a tool call request from the model
type MCPToolCall struct {
	Id        string         `json:"id"`
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

// MCPToolResult represents the result of an MCP tool call
type MCPToolResult struct {
	Id      string `json:"id"`
	Name    string `json:"name"`
	Content string `json:"content"`
	IsError bool   `json:"is_error,omitempty"`
}

// MCPToolInfo represents MCP tool metadata for function declaration
type MCPToolInfo struct {
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	InputSchema map[string]any    `json:"input_schema,omitempty"`
	Endpoint    string            `json:"endpoint"`          // MCP server endpoint
	Headers     map[string]string `json:"headers,omitempty"` // Custom headers for the MCP server
}
