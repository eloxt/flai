package llm

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flai/internal/consts"
	"flai/internal/logic"
	"flai/internal/model/entity"
	"strings"

	"github.com/go-viper/mapstructure/v2"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/os/gcfg"
	"github.com/google/uuid"
	"google.golang.org/genai"
)

type GeminiClient struct{}

// ============================================================================
// Client Creation
// ============================================================================

func (c *GeminiClient) getClient(ctx context.Context, providerInfo *logic.SimpleProviderInfo) (*genai.Client, error) {
	config := &genai.ClientConfig{
		APIKey:  providerInfo.ApiKey,
		Backend: genai.BackendGeminiAPI,
	}

	if providerInfo.BaseUrl != "" {
		config.HTTPOptions = genai.HTTPOptions{
			BaseURL: providerInfo.BaseUrl,
		}
	}

	return genai.NewClient(ctx, config)
}

// ============================================================================
// Stream Chat
// ============================================================================

func (c *GeminiClient) StreamChat(ctx context.Context, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string, files []*entity.File) error {
	client, err := c.getClient(ctx, providerInfo)
	if err != nil {
		return err
	}

	// Build chat history
	history, err := c.buildHistory(historyMessages)
	if err != nil {
		return err
	}

	// Build tools
	genaiTools := c.buildTools(tools)

	// Create chat config
	config := &genai.GenerateContentConfig{
		ThinkingConfig: &genai.ThinkingConfig{
			IncludeThoughts: true,
		},
		Tools: genaiTools,
	}

	chat, err := client.Chats.Create(ctx, modelConfig.ID, config, history)
	if err != nil {
		return err
	}

	// Build message parts
	parts, err := c.buildMessageParts(ctx, newMessage, files)
	if err != nil {
		return err
	}

	// Start streaming
	iter := chat.SendMessageStream(ctx, parts...)

	// Initialize stream state
	var currentMessageType string
	var currentContentBuilder strings.Builder
	var contentList []Content

	messageId := uuid.New().String()
	message := &entity.Message{
		Id:             messageId,
		ConversationId: newMessage.ConversationId,
		ParentId:       newMessage.Id,
		Role:           consts.MessageRole.Assistant,
	}
	metaInfo := MessageMetaInfo{
		ProviderName: providerInfo.Name,
		ModelName:    modelConfig.Name,
	}

	// Process stream
	for resp, err := range iter {
		if err != nil {
			if errors.Is(ctx.Err(), context.Canceled) {
				c.saveAndClose(ctx, message, &currentContentBuilder, currentMessageType, &contentList, metaInfo)
				return nil
			}
			return err
		}

		for _, candidate := range resp.Candidates {
			var thoughtSignature []byte

			if candidate.Content != nil {
				for _, part := range candidate.Content.Parts {
					if part.Text != "" {
						partType := consts.MessageType.Message
						if part.Thought {
							partType = consts.MessageType.Reasoning
						}

						// Update usage metadata
						metaInfo.CachedTokenCount = int(resp.UsageMetadata.CachedContentTokenCount)
						metaInfo.PromptTokenCount = int(resp.UsageMetadata.PromptTokenCount)
						metaInfo.ReasoningTokenCount = int(resp.UsageMetadata.ThoughtsTokenCount)
						metaInfo.ResponseTokenCount = int(resp.UsageMetadata.CandidatesTokenCount)
						metaInfo.ToolUseTokenCount = int(resp.UsageMetadata.ToolUsePromptTokenCount)

						// If type switched, save previous block
						if currentMessageType != "" && currentMessageType != partType {
							appendContent(&currentContentBuilder, currentMessageType, &contentList)
							currentContentBuilder.Reset()
						}

						currentMessageType = partType
						currentContentBuilder.WriteString(part.Text)

						// Stream to client
						streamResponse := StreamResponse{
							MessageId: messageId,
							Type:      partType,
						}
						if partType == consts.MessageType.Reasoning {
							streamResponse.Data = ContentReasoning{Content: part.Text}
						} else {
							streamResponse.Data = ContentMessage{Content: part.Text}
						}

						if err := StreamToClient(response, streamResponse); err != nil {
							if errors.Is(ctx.Err(), context.Canceled) {
								c.saveAndClose(ctx, message, &currentContentBuilder, currentMessageType, &contentList, metaInfo)
								return nil
							}
							return err
						}
					}

					if len(part.ThoughtSignature) > 0 {
						thoughtSignature = part.ThoughtSignature
					}
				}
			}

			if candidate.FinishReason == genai.FinishReasonStop {
				metaInfo.ThoughtSignature = base64.StdEncoding.EncodeToString(thoughtSignature)

				// Send meta info
				metaResponse := StreamResponse{
					MessageId: messageId,
					Type:      consts.MessageType.MetaInfo,
					Data:      metaInfo,
				}
				if err := StreamToClient(response, metaResponse); err != nil {
					if errors.Is(ctx.Err(), context.Canceled) {
						c.saveAndClose(ctx, message, &currentContentBuilder, currentMessageType, &contentList, metaInfo)
						return nil
					}
					return err
				}

				// Send grounding data if present
				if candidate.GroundingMetadata != nil && len(candidate.GroundingMetadata.GroundingChunks) > 0 {
					metaInfo.GoogleGroundingData = candidate.GroundingMetadata
					groundingResponse := StreamResponse{
						MessageId: messageId,
						Type:      consts.MessageType.GoogleGroundingData,
						Data:      candidate.GroundingMetadata,
					}
					if err := StreamToClient(response, groundingResponse); err != nil {
						if errors.Is(ctx.Err(), context.Canceled) {
							c.saveAndClose(ctx, message, &currentContentBuilder, currentMessageType, &contentList, metaInfo)
							return nil
						}
						return err
					}
				}
			}
		}
	}

	// Save final message
	c.saveAndClose(ctx, message, &currentContentBuilder, currentMessageType, &contentList, metaInfo)
	StreamDone(response)

	return nil
}

func (c *GeminiClient) saveAndClose(ctx context.Context, message *entity.Message, contentBuilder *strings.Builder, contentType string, contentList *[]Content, metaInfo MessageMetaInfo) {
	if contentType != "" && contentBuilder.Len() > 0 {
		appendContent(contentBuilder, contentType, contentList)
	}
	SaveAssistantMessage(context.WithoutCancel(ctx), message, *contentList, metaInfo)
}

// ============================================================================
// History Building
// ============================================================================

func (c *GeminiClient) buildHistory(historyMessages []*entity.Message) ([]*genai.Content, error) {
	var history []*genai.Content

	for _, msg := range historyMessages {
		var role genai.Role
		role = genai.RoleUser
		if msg.Role == consts.MessageRole.Assistant {
			role = genai.RoleModel
		}

		contents, err := ParseHistoryContents(msg)
		if err != nil {
			return nil, err
		}

		for _, content := range contents {
			if content.Type != consts.MessageType.Message {
				continue
			}

			var data ContentMessage
			if err := mapstructure.Decode(content.Data, &data); err != nil {
				return nil, err
			}

			history = append(history, genai.NewContentFromText(data.Content, role))

			// Add file references
			for _, file := range data.Files {
				history = append(history, genai.NewContentFromURI(file.Path, file.MimeType, role))
			}
		}
	}

	return history, nil
}

// ============================================================================
// Tool Building
// ============================================================================

func (c *GeminiClient) buildTools(tools []string) []*genai.Tool {
	genaiTools := []*genai.Tool{
		{URLContext: &genai.URLContext{}},
	}

	for _, tool := range tools {
		if tool == consts.InternalTools.InternalWebSearch {
			genaiTools = append(genaiTools, &genai.Tool{
				GoogleSearch: &genai.GoogleSearch{},
			})
		}
	}

	return genaiTools
}

// ============================================================================
// Message Parts Building
// ============================================================================

func (c *GeminiClient) buildMessageParts(ctx context.Context, newMessage *entity.Message, files []*entity.File) ([]genai.Part, error) {
	var parts []genai.Part

	// Add file parts
	publicUrl := gcfg.Instance().MustGet(ctx, "s3.publicUrl").String()
	if !strings.HasSuffix(publicUrl, "/") {
		publicUrl += "/"
	}

	for _, file := range files {
		parts = append(parts, *genai.NewPartFromURI(publicUrl+file.Path, file.MimeType))
	}

	// Add text content
	content, err := ParseMessageContent(newMessage)
	if err != nil {
		return nil, err
	}
	parts = append(parts, *genai.NewPartFromText(content))

	return parts, nil
}

// ============================================================================
// Title Generation
// ============================================================================

func (c *GeminiClient) GenerateTitle(ctx context.Context, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, systemInstruction string, content string) (*TitleGenerationResponse, error) {
	client, err := c.getClient(ctx, providerInfo)
	if err != nil {
		return nil, err
	}

	config := &genai.GenerateContentConfig{
		SystemInstruction: &genai.Content{
			Parts: []*genai.Part{genai.NewPartFromText(systemInstruction)},
		},
		ResponseMIMEType: "application/json",
		ResponseSchema:   c.getTitleSchema(ctx),
	}

	contentObj := &genai.Content{
		Parts: []*genai.Part{genai.NewPartFromText(content)},
	}

	resp, err := client.Models.GenerateContent(ctx, modelConfig.ID, []*genai.Content{contentObj}, config)
	if err != nil {
		return nil, err
	}

	return c.parseTitleResponse(resp)
}

func (c *GeminiClient) getTitleSchema(ctx context.Context) *genai.Schema {
	schemaJSON := `{
		"type": "object",
		"properties": {
			"icon": {"type": "string"},
			"title": {"type": "string"}
		},
		"propertyOrdering": ["icon", "title"]
	}`

	var schema genai.Schema
	if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
		g.Log().Errorf(ctx, "Failed to unmarshal schema: %v", err)
	}
	return &schema
}

func (c *GeminiClient) parseTitleResponse(resp *genai.GenerateContentResponse) (*TitleGenerationResponse, error) {
	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
		return nil, nil
	}

	var result strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		result.WriteString(part.Text)
	}

	var titleResp TitleGenerationResponse
	if err := json.Unmarshal([]byte(result.String()), &titleResp); err != nil {
		return nil, err
	}

	return &titleResp, nil
}
