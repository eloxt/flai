package llm

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"flai/internal/consts"
	"flai/internal/logic"
	"flai/internal/logic/mcp"
	"flai/internal/model/entity"
	"flai/internal/utility/s3"
	"fmt"
	"strings"

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

func (c *GeminiClient) StreamChat(ctx context.Context, messageId string, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string, mcpTools []*MCPToolInfo, files []*entity.File, thinkingIntensity string) error {
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
	genaiTools := c.buildTools(tools, mcpTools)

	// Build MCP tool map for quick lookup
	mcpToolMap := make(map[string]*MCPToolInfo)
	if len(mcpTools) > 0 {
		for _, tool := range mcpTools {
			mcpToolMap[tool.Name] = tool
		}
	}

	// MCP client cache - reuse clients for same endpoint
	mcpClientCache := make(map[string]*mcp.MCPClient)

	// Create content config
	var thinkingLevel genai.ThinkingLevel
	switch thinkingIntensity {
	case "minial":
		thinkingLevel = genai.ThinkingLevelMinimal
	case "low":
		thinkingLevel = genai.ThinkingLevelLow
	case "medium":
		thinkingLevel = genai.ThinkingLevelMedium
	case "high":
		thinkingLevel = genai.ThinkingLevelHigh
	}
	config := &genai.GenerateContentConfig{
		SystemInstruction: &genai.Content{
			Parts: []*genai.Part{genai.NewPartFromText(ComposeSystemPrompt())},
		},
		ThinkingConfig: &genai.ThinkingConfig{
			IncludeThoughts: modelConfig.Reasoning,
			ThinkingLevel:   thinkingLevel,
		},
		Tools: genaiTools,
	}

	// Build message parts
	parts, err := c.buildMessageParts(ctx, newMessage, files)
	if err != nil {
		return err
	}

	// Build full contents including history and new message
	var contents []*genai.Content
	for _, h := range history {
		contents = append(contents, h)
	}
	// Convert parts to pointer slice for Content.Parts
	var userParts []*genai.Part
	for _, p := range parts {
		partCopy := p
		userParts = append(userParts, &partCopy)
	}
	contents = append(contents, &genai.Content{
		Role:  "user",
		Parts: userParts,
	})

	// Initialize stream state
	var currentMessageType string
	var currentContentBuilder strings.Builder
	var currentImages []ContentImage
	var currentId string
	var contentList []Content

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

	// Tool call loop - continues until model finishes without requesting tools
	maxToolRounds := 10 // Prevent infinite loops

	for round := 0; round < maxToolRounds; round++ {

		// Start streaming with full content history
		iter := client.Models.GenerateContentStream(ctx, modelConfig.ID, contents, config)

		var functionCalls []*genai.FunctionCall
		var thoughtSignature []byte
		var modelParts []*genai.Part // Collect model's response parts for history

		// Process stream
		for resp, err := range iter {
			if err != nil {
				if HandleStreamError(ctx, message, currentImages, currentId, &currentContentBuilder, currentMessageType, &contentList, metaInfo) {
					return nil
				}
				return err
			}

			// Update usage metadata
			if resp.UsageMetadata != nil {
				metaInfo.CachedTokenCount = int(resp.UsageMetadata.CachedContentTokenCount)
				metaInfo.PromptTokenCount = int(resp.UsageMetadata.PromptTokenCount)
				metaInfo.ReasoningTokenCount = int(resp.UsageMetadata.ThoughtsTokenCount)
				metaInfo.ResponseTokenCount = int(resp.UsageMetadata.CandidatesTokenCount)
				metaInfo.ToolUseTokenCount = int(resp.UsageMetadata.ToolUsePromptTokenCount)
			}

			for _, candidate := range resp.Candidates {
				if candidate.Content != nil {
					for _, part := range candidate.Content.Parts {
						var partType string

						// Handle text content
						if part.Text != "" {
							partType = consts.MessageType.Message
							if part.Thought {
								partType = consts.MessageType.Reasoning
							}

							// If type switched, save previous block
							if currentMessageType != "" && currentMessageType != partType {
								appendContent(&currentContentBuilder, currentMessageType, currentImages, currentId, &contentList)
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
								return err
							}

							// Only add non-thought text to history
							if !part.Thought {
								modelParts = append(modelParts, &genai.Part{Text: part.Text})
							}
						}

						if part.InlineData != nil && len(part.InlineData.Data) > 0 && strings.HasPrefix(part.InlineData.MIMEType, "image/") {
							// Initialize S3 client for image upload
							s3Client, err := s3.New(ctx)
							if err != nil {
								return err
							}

							inlineData := part.InlineData

							// Generate unique filename for the image
							ext := ".png" // Default extension
							if strings.Contains(inlineData.MIMEType, "jpeg") {
								ext = ".jpg"
							} else if strings.Contains(inlineData.MIMEType, "webp") {
								ext = ".webp"
							}

							// Path format: {userId}/generated/{uuid}{ext}
							// Since we don't have userId easily accessible here without context extraction,
							// we can use a "generated" folder prefix.
							// However, ideally we should get userId from context if possible, but let's stick to a safe path.
							imageKey := fmt.Sprintf("generated/%s%s", uuid.New().String(), ext)

							// Upload to S3
							if err := s3Client.UploadBytes(ctx, imageKey, inlineData.Data, inlineData.MIMEType); err != nil {
								return err
							}

							// Get public URL
							imageUrl := s3.GetPublicUrl(ctx, imageKey)
							currentImages = append(currentImages, ContentImage{PublicUrl: imageUrl})

							// Stream to client
							streamResponse := StreamResponse{
								MessageId: messageId,
								Type:      consts.MessageType.Image,
								Data:      imageUrl,
							}

							if err := StreamToClient(response, streamResponse); err != nil {
								return err
							}
						}

						// Handle function calls
						if len(part.ThoughtSignature) > 0 {
							thoughtSignature = part.ThoughtSignature
						}

						if part.FunctionCall != nil {
							functionCalls = append(functionCalls, part.FunctionCall)
							modelParts = append(modelParts, &genai.Part{FunctionCall: part.FunctionCall, ThoughtSignature: thoughtSignature})
						}
					}
				}

				// Handle completion
				if candidate.FinishReason == genai.FinishReasonStop {
					metaInfo.ThoughtSignature = base64.StdEncoding.EncodeToString(thoughtSignature)

					// Send meta info
					metaResponse := StreamResponse{
						MessageId: messageId,
						Type:      consts.MessageType.MetaInfo,
						Data:      metaInfo,
					}
					if err := StreamToClient(response, metaResponse); err != nil {
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
							return err
						}
					}
				}
			}
		}

		// Check if we need to execute function calls
		if len(functionCalls) > 0 {
			// Save any pending content before adding tool calls (ensures correct order: reasoning -> tool_call)
			if currentContentBuilder.Len() > 0 {
				appendContent(&currentContentBuilder, currentMessageType, currentImages, currentId, &contentList)
				currentContentBuilder.Reset()
				currentMessageType = ""
			}

			// Add model's response to history (with function calls and thought signature)
			if len(modelParts) > 0 {
				contents = append(contents, &genai.Content{
					Role:  "model",
					Parts: modelParts,
				})
			}

			// Process function calls and build responses
			var functionResponseParts []*genai.Part

			for _, fc := range functionCalls {
				callId := uuid.New().String()

				toolCall := MCPToolCall{
					Id:        callId,
					Name:      fc.Name,
					Arguments: fc.Args,
				}

				// Add tool call to content list for saving
				contentList = append(contentList, Content{
					Type: consts.MessageType.ToolCall,
					Data: toolCall,
				})

				// Stream tool call to client
				toolCallResponse := StreamResponse{
					MessageId: messageId,
					Type:      consts.MessageType.ToolCall,
					Data:      toolCall,
				}
				if err := StreamToClient(response, toolCallResponse); err != nil {
					return err
				}

				// Execute the tool call
				toolResult := c.executeMCPToolCallByName(ctx, mcpToolMap, mcpClientCache, fc.Name, fc.Args)

				toolResultData := MCPToolResult{
					Id:      callId,
					Name:    fc.Name,
					Content: toolResult.Content,
					IsError: toolResult.IsError,
				}

				// Add tool result to content list for saving
				contentList = append(contentList, Content{
					Type: consts.MessageType.ToolResult,
					Data: toolResultData,
				})

				// Stream tool result to client
				toolResultResponse := StreamResponse{
					MessageId: messageId,
					Type:      consts.MessageType.ToolResult,
					Data:      toolResultData,
				}
				if err := StreamToClient(response, toolResultResponse); err != nil {
					return err
				}

				// Build function response part
				functionResponseParts = append(functionResponseParts, &genai.Part{
					FunctionResponse: &genai.FunctionResponse{
						Name: fc.Name,
						Response: map[string]any{
							"result": toolResult.Content,
							"error":  toolResult.IsError,
						},
					},
				})
			}

			// Add function responses as user content (function responses are sent as user role)
			contents = append(contents, &genai.Content{
				Role:  "user",
				Parts: functionResponseParts,
			})
			continue
		}

		// Model finished without requesting more tools
		break
	}

	// Save final message
	c.saveAndClose(ctx, message, currentImages, currentId, &currentContentBuilder, currentMessageType, &contentList, metaInfo)
	StreamDone(response)

	return nil
}

// executeMCPToolCallByName executes an MCP tool by name and returns the result
func (c *GeminiClient) executeMCPToolCallByName(ctx context.Context, mcpToolMap map[string]*MCPToolInfo, mcpClientCache map[string]*mcp.MCPClient, toolName string, args map[string]any) *MCPToolResult {
	result := &MCPToolResult{
		Name: toolName,
	}

	// Look up tool info
	toolInfo, ok := mcpToolMap[toolName]
	if !ok {
		result.Content = "Tool not found: " + toolName
		result.IsError = true
		return result
	}

	// Get or create MCP client for this endpoint
	mcpClient, ok := mcpClientCache[toolInfo.Endpoint]
	if !ok {
		// Create new client for this endpoint
		mcpClient = mcp.NewMCPClient(&mcp.MCPClientOption{
			Endpoint: toolInfo.Endpoint,
			Headers:  toolInfo.Headers,
		})
		mcpClientCache[toolInfo.Endpoint] = mcpClient
	}

	callResult, err := mcpClient.CallTool(ctx, &mcp.CallToolParams{
		Name:      toolName,
		Arguments: args,
	})
	if err != nil {
		result.Content = err.Error()
		result.IsError = true
		return result
	}

	// Combine all text content from the result
	var contentBuilder strings.Builder
	for _, item := range callResult.Content {
		if item.Type == "text" && item.Text != "" {
			contentBuilder.WriteString(item.Text)
		}
	}

	result.Content = contentBuilder.String()
	result.IsError = callResult.IsError
	return result
}

func (c *GeminiClient) saveAndClose(ctx context.Context, message *entity.Message, images []ContentImage, currentId string, contentBuilder *strings.Builder, contentType string, contentList *[]Content, metaInfo MessageMetaInfo) {
	if contentType != "" && contentBuilder.Len() > 0 {
		appendContent(contentBuilder, contentType, images, currentId, contentList)
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
			if err := DecodeWithJSONTags(content.Data, &data); err != nil {
				return nil, err
			}

			genaiContent := genai.NewContentFromText(data.Content, role)
			if msg.MetaInfo != "" {
				var metaInfo MessageMetaInfo
				if err := json.Unmarshal([]byte(msg.MetaInfo), &metaInfo); err != nil {
					return nil, err
				}
				if metaInfo.ThoughtSignature != "" {
					// decode base64
					decoded, err := base64.StdEncoding.DecodeString(metaInfo.ThoughtSignature)
					if err != nil {
						return nil, err
					}
					genaiContent.Parts[0].ThoughtSignature = decoded
				}
			}
			history = append(history, genaiContent)

			// Add file references
			for _, file := range data.Files {
				history = append(history, genai.NewContentFromURI(file.PublicUrl, file.MimeType, role))
			}

			// Add image references
			for _, image := range data.Images {
				history = append(history, genai.NewContentFromURI(image.PublicUrl, "image/png", role))
			}
		}
	}

	return history, nil
}

// ============================================================================
// Tool Building
// ============================================================================

func (c *GeminiClient) buildTools(tools []string, mcpTools []*MCPToolInfo) []*genai.Tool {
	genaiTools := []*genai.Tool{}

	for _, tool := range tools {
		switch tool {
		case consts.InternalTools.WebSearch:
			genaiTools = append(genaiTools, &genai.Tool{
				GoogleSearch: &genai.GoogleSearch{},
			})
		case consts.InternalTools.URLContext:
			genaiTools = append(genaiTools, &genai.Tool{
				URLContext: &genai.URLContext{},
			})
		}
	}

	// Add MCP tools as function declarations
	if len(mcpTools) > 0 {
		functionDeclarations := c.buildMCPFunctionDeclarations(mcpTools)
		if len(functionDeclarations) > 0 {
			genaiTools = append(genaiTools, &genai.Tool{
				FunctionDeclarations: functionDeclarations,
			})
		}
	}

	return genaiTools
}

// buildMCPFunctionDeclarations converts MCP tools to Gemini FunctionDeclarations
func (c *GeminiClient) buildMCPFunctionDeclarations(mcpTools []*MCPToolInfo) []*genai.FunctionDeclaration {
	var declarations []*genai.FunctionDeclaration

	for _, tool := range mcpTools {
		decl := &genai.FunctionDeclaration{
			Name:        tool.Name,
			Description: tool.Description,
		}

		// Convert InputSchema to genai.Schema
		if tool.InputSchema != nil {
			schemaJSON, err := json.Marshal(tool.InputSchema)
			if err == nil {
				var schema genai.Schema
				if json.Unmarshal(schemaJSON, &schema) == nil {
					decl.Parameters = &schema
				}
			}
		}

		declarations = append(declarations, decl)
	}

	return declarations
}

// executeMCPToolCall executes an MCP tool and returns the result
func (c *GeminiClient) executeMCPToolCall(ctx context.Context, mcpClient *mcp.MCPClient, toolCall *MCPToolCall) *MCPToolResult {
	result := &MCPToolResult{
		Id:   toolCall.Id,
		Name: toolCall.Name,
	}

	callResult, err := mcpClient.CallTool(ctx, &mcp.CallToolParams{
		Name:      toolCall.Name,
		Arguments: toolCall.Arguments,
	})
	if err != nil {
		result.Content = err.Error()
		result.IsError = true
		return result
	}

	// Combine all text content from the result
	var contentBuilder strings.Builder
	for _, item := range callResult.Content {
		if item.Type == "text" && item.Text != "" {
			contentBuilder.WriteString(item.Text)
		}
	}

	result.Content = contentBuilder.String()
	result.IsError = callResult.IsError
	return result
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
