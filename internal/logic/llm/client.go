package llm

import (
	"context"
	"encoding/json"
	"errors"
	v1 "flai/api/message/v1"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/logic"
	"flai/internal/model/entity"
	"fmt"
	"strings"
	"time"

	"github.com/gogf/gf/v2/errors/gerror"
)

// ============================================================================
// Client Interface
// ============================================================================

type Client interface {
	StreamChat(ctx context.Context, assistantMessageId string, response func(any) error, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string, mcpTools []*MCPToolInfo, files []*entity.File, thinkingIntensity string) error
	StreamTranslate(ctx context.Context, response func(any) error, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, prompt string, images []*entity.File) error
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
	case consts.ProviderType.OpenAICompletion:
		return &OpenAIChatClient{}, nil
	case consts.ProviderType.Gemini:
		return &GeminiClient{}, nil
	default:
		return nil, gerror.Newf("unsupported provider type: %s", providerType)
	}
}

// ============================================================================
// Public API Functions
// ============================================================================

func StreamChat(ctx context.Context, req *v1.CreateReq, response func(any) error, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, mcpTools []*MCPToolInfo, files []*entity.File) error {
	client, err := NewClient(providerInfo.ProviderType)
	if err != nil {
		return err
	}
	err = client.StreamChat(ctx, req.AssistantMessageId, response, providerInfo, modelConfig, historyMessages, newMessage, req.Tools, mcpTools, files, req.ThinkingIntensity)
	notifyError(ctx, "聊天", providerInfo, modelConfig, err)
	return err
}

func StreamTranslate(ctx context.Context, response func(any) error, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, prompt string, images []*entity.File) error {
	client, err := NewClient(providerInfo.ProviderType)
	if err != nil {
		return err
	}
	err = client.StreamTranslate(ctx, response, providerInfo, modelConfig, prompt, images)
	notifyError(ctx, "翻译", providerInfo, modelConfig, err)
	return err
}

func GenerateTitle(ctx context.Context, messages []*entity.Message, content string) (*TitleGenerationResponse, error) {
	config := logic.GetSystemConfig(consts.SystemConfig.TitleGeneration)
	if config == nil {
		return nil, gerror.New("Title generation config not found")
	}

	providerId := fmt.Sprintf("%v", config["provider_id"])
	modelId := fmt.Sprintf("%v", config["model_name"])
	template := fmt.Sprintf("%v", config["prompt"])

	providerInfo := logic.GetProvider(providerId)
	if providerInfo == nil {
		return nil, gerror.New("Provider not found")
	}

	modelConfig, ok := providerInfo.ModelIdMap[modelId]
	if !ok {
		return nil, gerror.New("Model not found")
	}

	xmlContent := buildChatHistoryXML(messages, content)

	client, err := NewClient(providerInfo.ProviderType)
	if err != nil {
		return nil, err
	}

	title, err := client.GenerateTitle(ctx, providerInfo, modelConfig, template, xmlContent)
	notifyError(ctx, "标题生成", providerInfo, modelConfig, err)
	return title, err
}

// ============================================================================
// Helper Functions
// ============================================================================

// buildChatHistoryXML formats messages as XML for title generation.
func buildChatHistoryXML(messages []*entity.Message, content string) string {
	var sb strings.Builder
	sb.WriteString("<chat_history>\n")
	if content != "" {
		sb.WriteString(fmt.Sprintf("<message role=\"user\">%s</message>\n", content))
	}
	if len(messages) > 0 {
		for _, msg := range messages {
			sb.WriteString(fmt.Sprintf("<message role=\"%s\">%s</message>\n", msg.Role, msg.Content))
		}
	}
	sb.WriteString("</chat_history>")
	return sb.String()
}

// appendContent appends content to the content list based on message type.
func appendContent(contentBuilder *strings.Builder, messageType string, images []ContentImage, id string, contentList *[]Content) {
	val := contentBuilder.String()
	if val == "" && len(images) == 0 {
		return
	}
	if messageType == consts.MessageType.Reasoning {
		data := ContentReasoning{Id: id, Content: val}
		content := Content{Type: consts.MessageType.Reasoning, Data: data}
		*contentList = append(*contentList, content)
	} else {
		data := ContentMessage{Id: id, Content: val}
		if len(images) > 0 {
			data.Images = images
		}
		content := Content{Type: consts.MessageType.Message, Data: data}
		*contentList = append(*contentList, content)
	}
}

// SaveAssistantMessage saves the assistant message to the database.
func SaveAssistantMessage(ctx context.Context, message *entity.Message, contentList []Content, metaInfo MessageMetaInfo) error {
	if len(contentList) == 0 {
		return fmt.Errorf("generation produced no content")
	}
	persistCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	contentListByte, err := json.Marshal(contentList)
	if err != nil {
		return fmt.Errorf("marshal assistant content: %w", err)
	}
	message.Content = string(contentListByte)

	metaInfoByte, err := json.Marshal(metaInfo)
	if err != nil {
		return fmt.Errorf("marshal assistant metadata: %w", err)
	}
	message.MetaInfo = string(metaInfoByte)

	_, err = dao.Message.Ctx(persistCtx).Data(message).Insert()
	if err != nil {
		return fmt.Errorf("save assistant message: %w", err)
	}
	return nil
}

// HandleStreamError checks if the error is due to context cancellation
// and saves partial output. A handled cancellation still propagates persistence errors.
func HandleStreamError(ctx context.Context, message *entity.Message, images []ContentImage, contentId string, contentBuilder *strings.Builder, contentType string, contentList *[]Content, metaInfo MessageMetaInfo) (bool, error) {
	if errors.Is(ctx.Err(), context.Canceled) {
		if contentBuilder != nil && (contentBuilder.Len() > 0 || len(images) > 0) {
			appendContent(contentBuilder, contentType, images, contentId, contentList)
		}
		return true, SaveAssistantMessage(ctx, message, *contentList, metaInfo)
	}
	return false, nil
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
	systemPromptObject := logic.GetSystemConfig(consts.SystemConfig.SystemPrompt)
	if systemPromptObject == nil {
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
