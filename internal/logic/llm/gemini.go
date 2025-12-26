package llm

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/logic"
	"flai/internal/model/entity"
	"strings"

	"github.com/go-viper/mapstructure/v2"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/google/uuid"
	"google.golang.org/genai"
)

type GeminiClient struct{}

func (geminiClient *GeminiClient) getClient(ctx context.Context, providerInfo *logic.SimpleProviderInfo) (*genai.Client, error) {
	if providerInfo.BaseUrl != "" {
		return genai.NewClient(ctx, &genai.ClientConfig{
			APIKey:  providerInfo.ApiKey,
			Backend: genai.BackendGeminiAPI,
			HTTPOptions: genai.HTTPOptions{
				BaseURL: providerInfo.BaseUrl,
			},
		})
	} else {
		return genai.NewClient(ctx, &genai.ClientConfig{
			APIKey:  providerInfo.ApiKey,
			Backend: genai.BackendGeminiAPI,
		})
	}
}
func (geminiClient *GeminiClient) StreamChat(ctx context.Context, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string) error {
	client, err := geminiClient.getClient(ctx, providerInfo)
	if err != nil {
		return err
	}

	// Convert historyMessages to genai.Message format
	var history []*genai.Content
	if len(historyMessages) > 0 {
		for _, msg := range historyMessages {
			var role genai.Role
			role = genai.RoleUser
			if msg.Role == consts.MessageRole.Assistant {
				role = genai.RoleModel
			}
			var contents []Content
			err := json.Unmarshal([]byte(msg.Content), &contents)
			if err != nil {
				return err
			}
			for _, content := range contents {
				if content.Type == consts.MessageType.Message {
					var data ContentMessage
					err := mapstructure.Decode(content.Data, &data)
					if err != nil {
						return err
					}
					history = append(history, genai.NewContentFromText(data.Content, role))
				}
			}
		}
	}
	var genaiTools = []*genai.Tool{}
	if tools != nil {
		for _, tool := range tools {
			if tool == consts.InternalTools.InternalWebSearch {
				genaiTools = append(genaiTools, &genai.Tool{
					GoogleSearch: &genai.GoogleSearch{},
				})
			}
		}
	}
	var config = &genai.GenerateContentConfig{
		ThinkingConfig: &genai.ThinkingConfig{
			IncludeThoughts: true,
		},
		Tools: genaiTools,
	}

	chat, err := client.Chats.Create(ctx, modelConfig.ID, config, history)
	if err != nil {
		return err
	}

	// Send the last message
	iter := chat.SendMessageStream(ctx, genai.Part{Text: newMessage.Content})

	var currentMessageType string
	var currentContentBuilder strings.Builder
	var contentList []Content
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
		if currentMessageType != "" && currentContentBuilder.Len() > 0 {
			appendContent(&currentContentBuilder, currentMessageType, &contentList)
		}
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

	for resp, err := range iter {
		if err != nil {
			if errors.Is(ctx.Err(), context.Canceled) {
				saveMessage(context.WithoutCancel(ctx))
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

						messageMetaInfo.CachedTokenCount = int(resp.UsageMetadata.CachedContentTokenCount)
						messageMetaInfo.PromptTokenCount = int(resp.UsageMetadata.PromptTokenCount)
						messageMetaInfo.ReasoningTokenCount = int(resp.UsageMetadata.ThoughtsTokenCount)
						messageMetaInfo.ResponseTokenCount = int(resp.UsageMetadata.CandidatesTokenCount)
						messageMetaInfo.ToolUseTokenCount = int(resp.UsageMetadata.ToolUsePromptTokenCount)

						// If type switched, save previous block
						if currentMessageType != "" && currentMessageType != partType {
							appendContent(&currentContentBuilder, currentMessageType, &contentList)
							currentContentBuilder.Reset()
						}

						currentMessageType = partType
						currentContentBuilder.WriteString(part.Text)

						streamResponse := StreamResponse{
							MessageId: messageId,
							Type:      partType,
						}
						if partType == consts.MessageType.Reasoning {
							streamResponse.Data = ContentReasoning{Content: part.Text}
						} else {
							streamResponse.Data = ContentMessage{Content: part.Text}
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
					if len(part.ThoughtSignature) > 0 {
						thoughtSignature = part.ThoughtSignature
					}
				}
			}
			if candidate.FinishReason == genai.FinishReasonStop {
				messageMetaInfo.ThoughtSignature = base64.StdEncoding.EncodeToString(thoughtSignature)
				streamResponse := StreamResponse{
					MessageId: messageId,
					Type:      consts.MessageType.MetaInfo,
					Data:      messageMetaInfo,
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
		}

	}

	saveMessage(context.WithoutCancel(ctx))
	response.Writef("data: [DONE]\n\n")
	response.Flush()
	return err
}

func (geminiClient *GeminiClient) GenerateTitle(ctx context.Context, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, systemInstruction string, content string) (*TitleGenerationResponse, error) {
	client, err := geminiClient.getClient(ctx, providerInfo)
	if err != nil {
		return nil, err
	}

	var config = &genai.GenerateContentConfig{
		SystemInstruction: &genai.Content{
			Parts: []*genai.Part{genai.NewPartFromText(systemInstruction)},
		},
		ResponseMIMEType: "application/json",
		ResponseSchema: func() *genai.Schema {
			schemaJSON := `{
          "type": "object",
          "properties": {
            "icon": {
              "type": "string"
            },
            "title": {
              "type": "string"
            }
          },
          "propertyOrdering": [
            "icon",
            "title"
          ]
        }`
			var schema genai.Schema
			if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
				g.Log().Errorf(ctx, "Failed to unmarshal schema: %v", err)
			}
			return &schema
		}(),
	}

	contentObj := &genai.Content{
		Parts: []*genai.Part{genai.NewPartFromText(content)},
	}

	resp, err := client.Models.GenerateContent(ctx, modelConfig.ID, []*genai.Content{contentObj}, config)
	if err != nil {
		return nil, err
	}

	if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
		var result string
		for _, part := range resp.Candidates[0].Content.Parts {
			result += part.Text
		}
		var titleGenerationResponse TitleGenerationResponse
		err := json.Unmarshal([]byte(result), &titleGenerationResponse)
		if err != nil {
			return nil, err
		}
		return &titleGenerationResponse, nil
	}

	return nil, gerror.New("Failed to generate title")
}
