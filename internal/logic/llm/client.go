package llm

import (
	"context"
	"encoding/json"
	"errors"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/logic"
	"flai/internal/model/entity"
	"fmt"
	"strings"
	"time"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
)

// ============================================================================
// Client Interface
// ============================================================================

type Client interface {
	StreamChat(ctx context.Context, assistantMessageId string, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string, mcpTools []*MCPToolInfo, files []*entity.File) error
	GenerateTitle(ctx context.Context, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, systemInstruction string, content string) (*TitleGenerationResponse, error)
}

// ============================================================================
// Client Factory
// ============================================================================

// NewClient creates a new LLM client based on provider type.
func NewClient(providerType string) (Client, error) {
	switch providerType {
	case consts.ProviderType.OpenAI:
		return &OpenAIClient{}, nil
	case consts.ProviderType.Gemini:
		return &GeminiClient{}, nil
	default:
		return nil, gerror.Newf("unsupported provider type: %s", providerType)
	}
}

// ============================================================================
// Public API Functions
// ============================================================================

func StreamChat(ctx context.Context, assistantMessageId string, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string, mcpTools []*MCPToolInfo, files []*entity.File) error {
	client, err := NewClient(providerInfo.ProviderType)
	if err != nil {
		return err
	}
	return client.StreamChat(ctx, assistantMessageId, response, providerInfo, modelConfig, historyMessages, newMessage, tools, mcpTools, files)
}

func GenerateTitle(ctx context.Context, messages []*entity.Message) (*TitleGenerationResponse, error) {
	config, ok := logic.SystemConfigMap[consts.SystemConfig.TitleGeneration]
	if !ok {
		return nil, gerror.New("Title generation config not found")
	}

	providerId := fmt.Sprintf("%v", config["provider_id"])
	modelId := fmt.Sprintf("%v", config["model_name"])
	template := fmt.Sprintf("%v", config["prompt"])

	providerInfo, ok := logic.ProviderMap[providerId]
	if !ok {
		return nil, gerror.New("Provider not found")
	}

	modelConfig, ok := providerInfo.ModelIdMap[modelId]
	if !ok {
		return nil, gerror.New("Model not found")
	}

	xmlContent := buildChatHistoryXML(messages)

	client, err := NewClient(providerInfo.ProviderType)
	if err != nil {
		return nil, err
	}

	return client.GenerateTitle(ctx, providerInfo, modelConfig, template, xmlContent)
}

// ============================================================================
// Helper Functions
// ============================================================================

// buildChatHistoryXML formats messages as XML for title generation.
func buildChatHistoryXML(messages []*entity.Message) string {
	var sb strings.Builder
	sb.WriteString("<chat_history>\n")
	for _, msg := range messages {
		sb.WriteString(fmt.Sprintf("<message role=\"%s\">%s</message>\n", msg.Role, msg.Content))
	}
	sb.WriteString("</chat_history>")
	return sb.String()
}

// StreamToClient sends SSE data to the client.
func StreamToClient(response *ghttp.Response, content any) error {
	data, err := json.Marshal(content)
	if err != nil {
		return err
	}
	response.Writef("data: %s\n\n", data)
	response.Flush()
	return nil
}

// StreamDone sends the SSE done signal to the client.
func StreamDone(response *ghttp.Response) {
	response.Writef("data: [DONE]\n\n")
	response.Flush()
}

// appendContent appends content to the content list based on message type.
func appendContent(contentBuilder *strings.Builder, messageType string, imageUrls []string, contentList *[]Content) {
	if contentBuilder.Len() == 0 {
		return
	}
	val := contentBuilder.String()
	if messageType == consts.MessageType.Reasoning {
		data := ContentReasoning{Content: val}
		content := Content{Type: consts.MessageType.Reasoning, Data: data}
		*contentList = append(*contentList, content)
	} else {
		data := ContentMessage{Content: val}
		if len(imageUrls) > 0 {
			data.ImageUrls = imageUrls
		}
		content := Content{Type: consts.MessageType.Message, Data: data}
		*contentList = append(*contentList, content)
	}
}

// SaveAssistantMessage saves the assistant message to the database.
func SaveAssistantMessage(ctx context.Context, message *entity.Message, contentList []Content, metaInfo MessageMetaInfo) {
	contentListByte, err := json.Marshal(contentList)
	if err != nil {
		g.Log().Errorf(ctx, "Failed to marshal content list: %v", err)
		return
	}
	message.Content = string(contentListByte)

	metaInfoByte, err := json.Marshal(metaInfo)
	if err != nil {
		g.Log().Errorf(ctx, "Failed to marshal meta info: %v", err)
		return
	}
	message.MetaInfo = string(metaInfoByte)

	_, err = dao.Message.Ctx(ctx).Data(message).Insert()
	if err != nil {
		g.Log().Errorf(ctx, "Failed to save message: %v", err)
	}
}

// HandleStreamError checks if the error is due to context cancellation
// and saves the message accordingly. Returns true if the caller should return nil.
func HandleStreamError(ctx context.Context, err error, message *entity.Message, imageUrls []string, contentBuilder *strings.Builder, contentType string, contentList *[]Content, metaInfo MessageMetaInfo) bool {
	if errors.Is(ctx.Err(), context.Canceled) {
		if contentBuilder != nil && contentBuilder.Len() > 0 {
			appendContent(contentBuilder, contentType, imageUrls, contentList)
		}
		SaveAssistantMessage(context.WithoutCancel(ctx), message, *contentList, metaInfo)
		return true
	}
	return false
}

// ParseMessageContent safely extracts the content string from a message.
func ParseMessageContent(newMessage *entity.Message) (string, error) {
	var contents []Content
	if err := json.Unmarshal([]byte(newMessage.Content), &contents); err != nil {
		return "", err
	}
	if len(contents) == 0 {
		return "", gerror.New("empty content list")
	}

	dataMap, ok := contents[0].Data.(map[string]any)
	if !ok {
		return "", gerror.New("invalid content data format")
	}

	content, ok := dataMap["content"].(string)
	if !ok {
		return "", gerror.New("content field is not a string")
	}

	return content, nil
}

// ParseHistoryContents parses the content JSON from a history message.
func ParseHistoryContents(msg *entity.Message) ([]Content, error) {
	var contents []Content
	if err := json.Unmarshal([]byte(msg.Content), &contents); err != nil {
		return nil, err
	}
	return contents, nil
}

func ComposeSystemPrompt() string {
	systemPromptObject, ok := logic.SystemConfigMap[consts.SystemConfig.SystemPrompt]
	if !ok {
		return ""
	}
	systemPromptString, ok := systemPromptObject["prompt"].(string)
	if !ok {
		return ""
	}

	// inject currentTime
	currentTimeString := time.Now().Format(time.RFC3339)
	systemPromptString = strings.ReplaceAll(systemPromptString, "{{currentDateTime}}", currentTimeString)

	return systemPromptString
}
