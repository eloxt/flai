package consts

import "github.com/gogf/gf/v2/errors/gcode"

var (
	NotActivated = gcode.New(1001, "User not activated.", nil)
)

// Message types
var MessageType = struct {
	Message             string
	Reasoning           string
	Image               string
	FunctionCall        string
	ToolCall            string
	ToolResult          string
	MetaInfo            string
	GoogleGroundingData string
	OpenaiGroundingData string
}{
	Message:             "message",
	Reasoning:           "reasoning",
	Image:               "image",
	FunctionCall:        "function_call",
	ToolCall:            "tool_call",
	ToolResult:          "tool_result",
	MetaInfo:            "meta_info",
	GoogleGroundingData: "google_grounding_data",
	OpenaiGroundingData: "openai_grounding_data",
}

// User roles
var UserRole = struct {
	User  string
	Admin string
}{
	User:  "user",
	Admin: "admin",
}

// Message roles
var MessageRole = struct {
	User      string
	Assistant string
	System    string
}{
	User:      "user",
	Assistant: "assistant",
	System:    "system",
}

// Provider types
var ProviderType = struct {
	OpenAI string
	Gemini string
}{
	OpenAI: "openai",
	Gemini: "gemini",
}

// System config keys
var SystemConfig = struct {
	TitleGeneration string
	SystemPrompt    string
	Notification    string
}{
	TitleGeneration: "title_generation",
	SystemPrompt:    "system_prompt",
	Notification:    "notification",
}

// Internal tools
var InternalTools = struct {
	WebSearch       string
	URLContext      string
	ImageGeneration string
}{
	WebSearch:       "web_search",
	URLContext:      "url_context",
	ImageGeneration: "image_generation",
}
