package llm

import (
	"context"
	"encoding/json"
	"errors"
	"flai/internal/consts"
	"flai/internal/logic"
	"flai/internal/model/entity"
	"strings"

	"github.com/go-viper/mapstructure/v2"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/google/uuid"
	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
)

type OpenAIClient struct{}

// ============================================================================
// Client Creation
// ============================================================================

func (c *OpenAIClient) getClient(ctx context.Context, providerInfo *logic.SimpleProviderInfo) openai.Client {
	opts := []option.RequestOption{
		option.WithAPIKey(providerInfo.ApiKey),
	}
	if providerInfo.BaseUrl != "" {
		opts = append(opts, option.WithBaseURL(providerInfo.BaseUrl))
	}
	return openai.NewClient(opts...)
}

// ============================================================================
// Stream Chat
// ============================================================================

func (c *OpenAIClient) StreamChat(ctx context.Context, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string, files []*entity.File) error {
	client := c.getClient(ctx, providerInfo)

	// Build input items from history and new message
	inputItems, err := c.buildInputItems(historyMessages, newMessage, files)
	if err != nil {
		return err
	}

	// Build tools
	openaiTools := c.buildTools(tools)

	// Create stream params
	params := responses.ResponseNewParams{
		Model: modelConfig.ID,
		Input: responses.ResponseNewParamsInputUnion{
			OfInputItemList: inputItems,
		},
		Reasoning: shared.ReasoningParam{
			Summary: shared.ReasoningSummaryAuto,
		},
		Tools: openaiTools,
	}

	stream := client.Responses.NewStreaming(ctx, params)

	// Initialize stream state
	var currentContentBuilder strings.Builder
	var contentList []Content
	var contentType string

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
	for stream.Next() {
		event := stream.Current()

		streamResponse := StreamResponse{
			MessageId: messageId,
		}

		shouldSend := false

		switch e := event.AsAny().(type) {
		case responses.ResponseReasoningSummaryTextDeltaEvent:
			if e.Delta != "" {
				contentType = consts.MessageType.Reasoning
				currentContentBuilder.WriteString(e.Delta)
				streamResponse.Data = ContentReasoning{Content: e.Delta}
				streamResponse.Type = contentType
				shouldSend = true
			}

		case responses.ResponseReasoningSummaryPartDoneEvent:
			currentContentBuilder.WriteString("\n\n")
			contentType = consts.MessageType.Reasoning
			streamResponse.Data = ContentReasoning{Content: "\n\n"}
			streamResponse.Type = contentType
			shouldSend = true

		case responses.ResponseOutputItemDoneEvent:
			appendContent(&currentContentBuilder, contentType, &contentList)
			currentContentBuilder.Reset()

			// Handle annotations
			var annotations []responses.ResponseOutputTextAnnotationUnion
			for _, content := range e.Item.Content {
				if len(content.Annotations) > 0 {
					annotations = append(annotations, content.Annotations...)
				}
			}

			if len(annotations) > 0 {
				metaInfo.OpenaiGroundingData = annotations
				annotationResponse := StreamResponse{
					MessageId: messageId,
					Type:      consts.MessageType.OpenaiGroundingData,
					Data:      annotations,
				}
				if err := StreamToClient(response, annotationResponse); err != nil {
					if errors.Is(ctx.Err(), context.Canceled) {
						c.saveAndClose(ctx, message, &currentContentBuilder, contentType, &contentList, metaInfo)
						return nil
					}
					return err
				}
			}
			continue

		case responses.ResponseTextDeltaEvent:
			if e.Delta != "" {
				contentType = consts.MessageType.Message
				currentContentBuilder.WriteString(e.Delta)
				streamResponse.Data = ContentMessage{Content: e.Delta}
				streamResponse.Type = contentType
				shouldSend = true
			}

		case responses.ResponseCompletedEvent:
			metaInfo.CachedTokenCount = int(e.Response.Usage.InputTokensDetails.CachedTokens)
			metaInfo.PromptTokenCount = int(e.Response.Usage.InputTokens)
			metaInfo.ReasoningTokenCount = int(e.Response.Usage.OutputTokensDetails.ReasoningTokens)
			metaInfo.ResponseTokenCount = int(e.Response.Usage.OutputTokens)
			streamResponse.Type = consts.MessageType.MetaInfo
			streamResponse.Data = metaInfo
			shouldSend = true

		default:
			continue
		}

		if shouldSend {
			if err := StreamToClient(response, streamResponse); err != nil {
				if errors.Is(ctx.Err(), context.Canceled) {
					c.saveAndClose(ctx, message, &currentContentBuilder, contentType, &contentList, metaInfo)
					return nil
				}
				return err
			}
		}
	}

	if err := stream.Err(); err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			c.saveAndClose(ctx, message, &currentContentBuilder, contentType, &contentList, metaInfo)
			return nil
		}
		return err
	}

	// Save final message
	c.saveAndClose(ctx, message, &currentContentBuilder, contentType, &contentList, metaInfo)
	StreamDone(response)

	return nil
}

func (c *OpenAIClient) saveAndClose(ctx context.Context, message *entity.Message, contentBuilder *strings.Builder, contentType string, contentList *[]Content, metaInfo MessageMetaInfo) {
	appendContent(contentBuilder, contentType, contentList)
	SaveAssistantMessage(ctx, message, *contentList, metaInfo)
}

// ============================================================================
// Input Building
// ============================================================================

func (c *OpenAIClient) buildInputItems(historyMessages []*entity.Message, newMessage *entity.Message, files []*entity.File) ([]responses.ResponseInputItemUnionParam, error) {
	var inputItems []responses.ResponseInputItemUnionParam

	// Build history items
	for _, msg := range historyMessages {
		role := responses.EasyInputMessageRoleUser
		if msg.Role == consts.MessageRole.Assistant {
			role = responses.EasyInputMessageRoleAssistant
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

			inputItems = append(inputItems, responses.ResponseInputItemParamOfMessage(data.Content, role))

			// Add file items
			for _, file := range data.Files {
				inputItems = append(inputItems, c.buildFileInputItem(file, role))
			}
		}
	}

	// Add new message content
	content, err := ParseMessageContent(newMessage)
	if err != nil {
		return nil, err
	}
	inputItems = append(inputItems, responses.ResponseInputItemParamOfMessage(content, responses.EasyInputMessageRoleUser))

	// Add new message files
	for _, file := range files {
		inputItems = append(inputItems, c.buildFileInputItem(file, responses.EasyInputMessageRoleUser))
	}

	return inputItems, nil
}

func (c *OpenAIClient) buildFileInputItem(file *entity.File, role responses.EasyInputMessageRole) responses.ResponseInputItemUnionParam {
	if strings.HasPrefix(file.MimeType, "image") {
		param := []responses.ResponseInputContentUnionParam{
			{
				OfInputImage: &responses.ResponseInputImageParam{
					ImageURL: openai.String(file.PublicUrl),
				},
			},
		}
		return responses.ResponseInputItemParamOfMessage(responses.ResponseInputMessageContentListParam(param), role)
	}

	param := []responses.ResponseInputContentUnionParam{
		{
			OfInputFile: &responses.ResponseInputFileParam{
				FileURL: openai.String(file.PublicUrl),
			},
		},
	}
	return responses.ResponseInputItemParamOfMessage(responses.ResponseInputMessageContentListParam(param), role)
}

// ============================================================================
// Tool Building
// ============================================================================

func (c *OpenAIClient) buildTools(tools []string) []responses.ToolUnionParam {
	var openaiTools []responses.ToolUnionParam

	for _, tool := range tools {
		if tool == consts.InternalTools.InternalWebSearch {
			openaiTools = append(openaiTools, responses.ToolUnionParam{
				OfWebSearch: &responses.WebSearchToolParam{
					Type: responses.WebSearchToolTypeWebSearch,
				},
			})
		}
	}

	return openaiTools
}

// ============================================================================
// Title Generation
// ============================================================================

func (c *OpenAIClient) GenerateTitle(ctx context.Context, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, systemInstruction string, content string) (*TitleGenerationResponse, error) {
	client := c.getClient(ctx, providerInfo)

	jsonSchema := c.getTitleSchema()

	params := responses.ResponseNewParams{
		Instructions: openai.String(systemInstruction),
		Model:        modelConfig.ID,
		Input: responses.ResponseNewParamsInputUnion{
			OfString: openai.String(content),
		},
		Text: responses.ResponseTextConfigParam{
			Format: responses.ResponseFormatTextConfigUnionParam{
				OfJSONSchema: &jsonSchema,
			},
		},
	}

	resp, err := client.Responses.New(ctx, params)
	if err != nil {
		return nil, err
	}

	var titleResp TitleGenerationResponse
	if err := json.Unmarshal([]byte(resp.OutputText()), &titleResp); err != nil {
		return nil, err
	}

	return &titleResp, nil
}

func (c *OpenAIClient) getTitleSchema() responses.ResponseFormatTextJSONSchemaConfigParam {
	schemaJSON := `{
		"type": "object",
		"properties": {
			"title": {"type": "string"},
			"icon": {"type": "string"}
		},
		"additionalProperties": false,
		"required": ["title", "icon"]
	}`

	var schema map[string]any
	json.Unmarshal([]byte(schemaJSON), &schema)

	return responses.ResponseFormatTextJSONSchemaConfigParam{
		Name:        "title_and_icon",
		Description: openai.String("Generate title and icon for a conversation"),
		Strict:      openai.Bool(true),
		Schema:      schema,
	}
}
