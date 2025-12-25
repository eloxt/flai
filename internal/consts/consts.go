package consts

// Message types
var MessageType = struct {
	Message      string
	Reasoning    string
	Image        string
	FunctionCall string
	MetaInfo     string
}{
	Message:      "message",
	Reasoning:    "reasoning",
	Image:        "image",
	FunctionCall: "function_call",
	MetaInfo:     "meta_info",
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
}{
	TitleGeneration: "title_generation",
}
