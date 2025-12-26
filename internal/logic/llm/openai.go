package llm

import (
	"context"
	"encoding/json"
	"errors"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/logic"
	"flai/internal/model/entity"
	"strings"

	"github.com/go-viper/mapstructure/v2"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/google/uuid"
	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
)

type OpenAIClient struct{}

func (c *OpenAIClient) getClient(ctx context.Context, providerInfo *logic.SimpleProviderInfo) openai.Client {
	opts := []option.RequestOption{
		option.WithAPIKey(providerInfo.ApiKey),
	}
	if providerInfo.BaseUrl != "" {
		opts = append(opts, option.WithBaseURL(providerInfo.BaseUrl))
	}
	return openai.NewClient(opts...)
}

func (c *OpenAIClient) StreamChat(ctx context.Context, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string) error {
	client := c.getClient(ctx, providerInfo)

	var inputItems []responses.ResponseInputItemUnionParam

	if len(historyMessages) > 0 {
		for _, msg := range historyMessages {
			var contents []Content
			err := json.Unmarshal([]byte(msg.Content), &contents)
			if err != nil {
				return err
			}
			role := responses.EasyInputMessageRoleUser
			if msg.Role == consts.MessageRole.Assistant {
				role = responses.EasyInputMessageRoleAssistant
			}

			for _, content := range contents {
				if content.Type == consts.MessageType.Message {
					var data ContentMessage
					if err := mapstructure.Decode(content.Data, &data); err != nil {
						return err
					}
					inputItems = append(inputItems, responses.ResponseInputItemParamOfMessage(data.Content, role))
				}
			}
		}
	}

	inputItems = append(inputItems, responses.ResponseInputItemParamOfMessage(newMessage.Content, responses.EasyInputMessageRoleUser))

	input := responses.ResponseNewParamsInputUnion{
		OfInputItemList: inputItems,
	}

	openaiTools := []responses.ToolUnionParam{}
	for _, tool := range tools {
		if tool == consts.InternalTools.InternalWebSearch {
			openaiTools = append(openaiTools, responses.ToolUnionParam{
				OfWebSearch: &responses.WebSearchToolParam{
					Type: responses.WebSearchToolTypeWebSearch,
				},
			})
		}
	}
	params := responses.ResponseNewParams{
		Model: modelConfig.ID,
		Input: input,
		Reasoning: shared.ReasoningParam{
			Summary: shared.ReasoningSummaryAuto,
		},
		Tools: openaiTools,
	}
	stream := client.Responses.NewStreaming(ctx, params)

	var currentContentBuilder strings.Builder
	var contentList []Content
	var contentType string
	messageId := uuid.New().String()
	conversationId := newMessage.ConversationId
	message := entity.Message{
		Id:             messageId,
		ConversationId: conversationId,
		ParentId:       newMessage.Id,
		Role:           consts.MessageRole.Assistant,
	}
	messageMetaInfo := MessageMetaInfo{
		ProviderName: providerInfo.Name,
		ModelName:    modelConfig.Name,
	}

	saveMessage := func(ctx context.Context) {
		appendContent(&currentContentBuilder, contentType, &contentList)
		contentListByte, err := json.Marshal(contentList)
		if err != nil {
			g.Log().Errorf(ctx, "Failed to marshal content list: %v", err)
			return
		}
		message.Content = string(contentListByte)
		messageMetaInfoByte, err := json.Marshal(messageMetaInfo)
		if err != nil {
			g.Log().Errorf(ctx, "Failed to marshal meta info: %v", err)
			return
		}
		message.MetaInfo = string(messageMetaInfoByte)
		_, err = dao.Message.Ctx(ctx).Data(message).Insert()
		if err != nil {
			g.Log().Errorf(ctx, "Failed to save message: %v", err)
		}
	}

	for stream.Next() {
		event := stream.Current()
		streamResponse := StreamResponse{
			MessageId: messageId,
		}
		switch e := event.AsAny().(type) {
		case responses.ResponseReasoningSummaryTextDeltaEvent:
			if e.Delta != "" {
				contentType = consts.MessageType.Reasoning
				currentContentBuilder.WriteString(e.Delta)
				streamResponse.Data = ContentReasoning{Content: e.Delta}
				streamResponse.Type = contentType
			}
		case responses.ResponseReasoningSummaryPartDoneEvent:
			currentContentBuilder.WriteString("\n\n")
			contentType = consts.MessageType.Reasoning
			streamResponse.Data = ContentReasoning{"\n\n"}
			streamResponse.Type = contentType
		case responses.ResponseOutputItemDoneEvent:
			appendContent(&currentContentBuilder, contentType, &contentList)
			currentContentBuilder.Reset()
			continue
		case responses.ResponseTextDeltaEvent:
			if e.Delta != "" {
				contentType = consts.MessageType.Message
				currentContentBuilder.WriteString(e.Delta)
				streamResponse.Data = ContentMessage{Content: e.Delta}
				streamResponse.Type = contentType
			}
		case responses.ResponseCompletedEvent:
			messageMetaInfo.CachedTokenCount = int(e.Response.Usage.InputTokensDetails.CachedTokens)
			messageMetaInfo.PromptTokenCount = int(e.Response.Usage.InputTokens)
			messageMetaInfo.ReasoningTokenCount = int(e.Response.Usage.OutputTokensDetails.ReasoningTokens)
			messageMetaInfo.ResponseTokenCount = int(e.Response.Usage.OutputTokens)
			streamResponse.Type = consts.MessageType.MetaInfo
			streamResponse.Data = messageMetaInfo
		default:
			continue
		}

		err := StreamToClient(response, streamResponse)
		if err != nil {
			if errors.Is(ctx.Err(), context.Canceled) {
				saveMessage(context.WithoutCancel(ctx))
				return nil
			}
			return err
		}
	}

	if err := stream.Err(); err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			saveMessage(context.WithoutCancel(ctx))
			return nil
		}
		return err
	}

	saveMessage(ctx)
	response.Writef("data: [DONE]\n\n")
	response.Flush()
	return nil
}

func (c *OpenAIClient) GenerateTitle(ctx context.Context, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, systemInstruction string, content string) (*TitleGenerationResponse, error) {
	client := c.getClient(ctx, providerInfo)

	jsonSchemaText := `
{
  "type": "object",
  "properties": {
    "title": {
      "type": "string"
    },
    "icon": {
      "type": "string"
    }
  },
  "additionalProperties": false,
  "required": [
    "title",
    "icon"
  ]
}
`
	var schema map[string]any
	err := json.Unmarshal([]byte(jsonSchemaText), &schema)

	jsonSchema := responses.ResponseFormatTextJSONSchemaConfigParam{
		Name:        "title_and_icon",
		Description: openai.String("Generate title and icon for a conversation"),
		Strict:      openai.Bool(true),
		Schema:      schema,
	}

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

	var titleGenerationResponse TitleGenerationResponse
	err = json.Unmarshal([]byte(resp.OutputText()), &titleGenerationResponse)
	if err != nil {
		return nil, err
	}
	return &titleGenerationResponse, nil
}
