package llm

import (
	"context"
	"encoding/json"
	"flai/internal/consts"
	"flai/internal/logic"
	"flai/internal/logic/mcp"
	"flai/internal/model/entity"
	"strings"

	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/google/uuid"
	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

type OpenAIChatClient struct{}

func (c *OpenAIChatClient) getClient(providerInfo *logic.SimpleProviderInfo) openai.Client {
	opts := []option.RequestOption{
		option.WithAPIKey(providerInfo.ApiKey),
	}
	if providerInfo.BaseUrl != "" {
		opts = append(opts, option.WithBaseURL(providerInfo.BaseUrl))
	}
	return openai.NewClient(opts...)
}

func (c *OpenAIChatClient) StreamChat(ctx context.Context, messageId string, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string, mcpTools []*MCPToolInfo, files []*entity.File, thinkingIntensity string) error {
	client := c.getClient(providerInfo)

	messages, err := c.buildMessages(historyMessages, newMessage, files)
	if err != nil {
		return err
	}

	chatTools := c.buildChatTools(mcpTools)

	mcpToolMap := make(map[string]*MCPToolInfo)
	for _, tool := range mcpTools {
		mcpToolMap[tool.Name] = tool
	}

	mcpClientCache := make(map[string]*mcp.MCPClient)

	var currentContentBuilder strings.Builder
	var contentList []Content
	var currentImages []ContentImage
	var currentContentId string
	var contentType string

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

	maxToolRounds := 10
	currentMessages := messages

	for range maxToolRounds {
		params := openai.ChatCompletionNewParams{
			Model:    modelConfig.ID,
			Messages: currentMessages,
		}

		if len(chatTools) > 0 {
			params.Tools = chatTools
		}

		stream := client.Chat.Completions.NewStreaming(ctx, params)
		acc := openai.ChatCompletionAccumulator{}

		for stream.Next() {
			chunk := stream.Current()
			acc.AddChunk(chunk)

			if len(chunk.Choices) == 0 {
				continue
			}

			delta := chunk.Choices[0].Delta
			streamResponse := StreamResponse{MessageId: messageId}
			shouldSend := false

			if delta.Content != "" {
				contentType = consts.MessageType.Message
				currentContentBuilder.WriteString(delta.Content)
				streamResponse.Data = ContentMessage{Content: delta.Content}
				streamResponse.Type = contentType
				shouldSend = true
			}

			if chunk.Usage.PromptTokens > 0 {
				metaInfo.PromptTokenCount = int(chunk.Usage.PromptTokens)
				metaInfo.ResponseTokenCount = int(chunk.Usage.CompletionTokens)
			}

			if shouldSend {
				if err := StreamToClient(response, streamResponse); err != nil {
					return err
				}
			}
		}

		if err := stream.Err(); err != nil {
			if HandleStreamError(ctx, message, currentImages, currentContentId, &currentContentBuilder, contentType, &contentList, metaInfo) {
				return nil
			}
			return err
		}

		toolCalls := acc.Choices[0].Message.ToolCalls
		if len(toolCalls) > 0 {
			if currentContentBuilder.Len() > 0 {
				appendContent(&currentContentBuilder, contentType, currentImages, currentContentId, &contentList)
				currentContentBuilder.Reset()
				contentType = ""
			}

			currentMessages = append(currentMessages, acc.Choices[0].Message.ToParam())

			for _, tc := range toolCalls {
				callId := uuid.New().String()

				var args map[string]any
				if tc.Function.Arguments != "" {
					json.Unmarshal([]byte(tc.Function.Arguments), &args)
				}

				toolCall := MCPToolCall{
					Id:        callId,
					Name:      tc.Function.Name,
					Arguments: args,
				}

				contentList = append(contentList, Content{
					Type: consts.MessageType.ToolCall,
					Data: toolCall,
				})

				if err := StreamToClient(response, StreamResponse{
					MessageId: messageId,
					Type:      consts.MessageType.ToolCall,
					Data:      toolCall,
				}); err != nil {
					return err
				}

				toolResult := c.executeMCPToolCallByName(ctx, mcpToolMap, mcpClientCache, tc.Function.Name, args)

				toolResultData := MCPToolResult{
					Id:      callId,
					Name:    tc.Function.Name,
					Content: toolResult.Content,
					IsError: toolResult.IsError,
				}

				contentList = append(contentList, Content{
					Type: consts.MessageType.ToolResult,
					Data: toolResultData,
				})

				if err := StreamToClient(response, StreamResponse{
					MessageId: messageId,
					Type:      consts.MessageType.ToolResult,
					Data:      toolResultData,
				}); err != nil {
					return err
				}

				currentMessages = append(currentMessages, openai.ToolMessage(toolResult.Content, tc.ID))
			}
			continue
		}

		break
	}

	c.saveAndClose(ctx, message, currentImages, currentContentId, &currentContentBuilder, contentType, &contentList, metaInfo)
	StreamDone(response)

	return nil
}

func (c *OpenAIChatClient) saveAndClose(ctx context.Context, message *entity.Message, imageUrls []ContentImage, currentId string, contentBuilder *strings.Builder, contentType string, contentList *[]Content, metaInfo MessageMetaInfo) {
	appendContent(contentBuilder, contentType, imageUrls, currentId, contentList)
	SaveAssistantMessage(context.WithoutCancel(ctx), message, *contentList, metaInfo)
}

func (c *OpenAIChatClient) StreamTranslate(ctx context.Context, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, prompt string) error {
	client := c.getClient(providerInfo)

	stream := client.Chat.Completions.NewStreaming(ctx, openai.ChatCompletionNewParams{
		Model: modelConfig.ID,
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage(prompt),
		},
	})

	for stream.Next() {
		chunk := stream.Current()
		if len(chunk.Choices) == 0 {
			continue
		}

		delta := chunk.Choices[0].Delta.Content
		if delta == "" {
			continue
		}

		if err := StreamToClient(response, StreamResponse{
			Type: consts.MessageType.Message,
			Data: ContentMessage{Content: delta},
		}); err != nil {
			return err
		}
	}

	if err := stream.Err(); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return err
	}

	StreamDone(response)
	return nil
}

func (c *OpenAIChatClient) executeMCPToolCallByName(ctx context.Context, mcpToolMap map[string]*MCPToolInfo, mcpClientCache map[string]*mcp.MCPClient, toolName string, args map[string]any) *MCPToolResult {
	result := &MCPToolResult{Name: toolName}

	toolInfo, ok := mcpToolMap[toolName]
	if !ok {
		result.Content = "Tool not found: " + toolName
		result.IsError = true
		return result
	}

	mcpClient, ok := mcpClientCache[toolInfo.Endpoint]
	if !ok {
		newClient := mcp.NewMCPClient(&mcp.MCPClientOption{
			Endpoint: toolInfo.Endpoint,
			Headers:  toolInfo.Headers,
		})
		mcpClientCache[toolInfo.Endpoint] = newClient
		mcpClient = newClient
	}

	callResult, err := mcpClient.CallTool(ctx, &mcp.CallToolParams{
		Name:      toolName,
		Arguments: args,
	})
	if err != nil {
		result.Content = "Tool execution error: " + err.Error()
		result.IsError = true
		return result
	}

	var textContent strings.Builder
	for _, content := range callResult.Content {
		if content.Type == "text" && content.Text != "" {
			textContent.WriteString(content.Text)
		}
	}

	result.Content = textContent.String()
	result.IsError = callResult.IsError
	return result
}

func (c *OpenAIChatClient) buildMessages(historyMessages []*entity.Message, newMessage *entity.Message, files []*entity.File) ([]openai.ChatCompletionMessageParamUnion, error) {
	var messages []openai.ChatCompletionMessageParamUnion

	messages = append(messages, openai.SystemMessage(ComposeSystemPrompt()))

	for _, msg := range historyMessages {
		contents, err := ParseHistoryContents(msg)
		if err != nil {
			return nil, err
		}

		for _, content := range contents {
			if content.Type != consts.MessageType.Message {
				continue
			}

			var data ContentMessage
			if err := DecodeWithJSONTags(content.Data, &data); err != nil {
				return nil, err
			}

			if data.Content != "" {
				if msg.Role == consts.MessageRole.Assistant {
					messages = append(messages, openai.AssistantMessage(data.Content))
				} else {
					messages = append(messages, openai.UserMessage(data.Content))
				}
			}
		}
	}

	content, err := ParseMessageContent(newMessage)
	if err != nil {
		return nil, err
	}
	messages = append(messages, openai.UserMessage(content))

	return messages, nil
}

func (c *OpenAIChatClient) buildChatTools(mcpTools []*MCPToolInfo) []openai.ChatCompletionToolUnionParam {
	var tools []openai.ChatCompletionToolUnionParam

	for _, mcpTool := range mcpTools {
		tools = append(tools, openai.ChatCompletionFunctionTool(openai.FunctionDefinitionParam{
			Name:        mcpTool.Name,
			Description: openai.String(mcpTool.Description),
			Parameters:  openai.FunctionParameters(mcpTool.InputSchema),
		}))
	}

	return tools
}

func (c *OpenAIChatClient) GenerateTitle(ctx context.Context, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, systemInstruction string, content string) (*TitleGenerationResponse, error) {
	client := c.getClient(providerInfo)

	params := openai.ChatCompletionNewParams{
		Model: modelConfig.ID,
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(systemInstruction),
			openai.UserMessage(content),
		},
		ResponseFormat: openai.ChatCompletionNewParamsResponseFormatUnion{
			OfJSONSchema: &openai.ResponseFormatJSONSchemaParam{
				JSONSchema: openai.ResponseFormatJSONSchemaJSONSchemaParam{
					Name:   "title_and_icon",
					Strict: openai.Bool(true),
					Schema: map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"title": map[string]interface{}{"type": "string"},
							"icon":  map[string]interface{}{"type": "string"},
						},
						"required":             []string{"title", "icon"},
						"additionalProperties": false,
					},
				},
			},
		},
	}

	resp, err := client.Chat.Completions.New(ctx, params)
	if err != nil {
		return nil, err
	}

	var titleResp TitleGenerationResponse
	if err := json.Unmarshal([]byte(resp.Choices[0].Message.Content), &titleResp); err != nil {
		return nil, err
	}

	return &titleResp, nil
}
