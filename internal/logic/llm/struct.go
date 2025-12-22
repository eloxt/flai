package llm

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
