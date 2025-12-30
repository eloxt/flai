package message

import (
	"context"
	"encoding/json"
	v1 "flai/api/message/v1"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/logic"
	"flai/internal/logic/llm"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"
	"strings"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
)

func (c *ControllerV1) Create(ctx context.Context, req *v1.CreateReq) (res *v1.CreateRes, err error) {
	// Validate user
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "User not found")
	}

	// Validate conversation access
	conversation, err := c.validateConversationAccess(ctx, req.ConversationId, user.Id)
	if err != nil {
		return nil, err
	}
	if conversation == nil {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Conversation not found")
	}

	// Fetch message history
	historyMessages, err := c.fetchMessageHistory(ctx, req.MessagePath)
	if err != nil {
		return nil, err
	}

	// Fetch files
	files, err := c.fetchFiles(ctx, req.Files)
	if err != nil {
		return nil, err
	}

	// Create and save user message
	newMessage, err := c.createUserMessage(ctx, req, historyMessages, files)
	if err != nil {
		return nil, err
	}

	// Validate provider and model
	providerInfo, modelConfig, err := c.validateProviderAndModel(req.ProviderId, req.ModelName)
	if err != nil {
		return nil, err
	}

	// Setup SSE response
	response, err := c.setupSSEResponse(ctx)
	if err != nil {
		return nil, err
	}

	// Stream chat response
	if err := llm.StreamChat(ctx, response, providerInfo, modelConfig, historyMessages, newMessage, req.Tools, files); err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to stream message")
	}

	return nil, nil
}

// validateConversationAccess checks if the user has access to the conversation.
func (c *ControllerV1) validateConversationAccess(ctx context.Context, conversationId, userId string) (*entity.Conversation, error) {
	var conversation entity.Conversation
	err := dao.Conversation.Ctx(ctx).
		Where(do.Conversation{
			Id:     conversationId,
			UserId: userId,
		}).
		WhereNull("deleted_at").
		Scan(&conversation)

	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch conversation")
	}

	if conversation.Id == "" {
		return nil, nil
	}

	return &conversation, nil
}

// fetchMessageHistory fetches and validates message history.
func (c *ControllerV1) fetchMessageHistory(ctx context.Context, messagePath []string) ([]*entity.Message, error) {
	historyMessages, err := dao.FetchMessageHistory(ctx, messagePath)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch message history")
	}

	if len(historyMessages) != len(messagePath) {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid message path")
	}

	return historyMessages, nil
}

// fetchFiles fetches files by IDs.
func (c *ControllerV1) fetchFiles(ctx context.Context, fileIds []string) ([]*entity.File, error) {
	if len(fileIds) == 0 {
		return nil, nil
	}

	var files []*entity.File
	err := dao.File.Ctx(ctx).WhereIn(dao.File.Columns().Id, fileIds).Scan(&files)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch files")
	}

	return files, nil
}

// createUserMessage creates and saves the user message.
func (c *ControllerV1) createUserMessage(ctx context.Context, req *v1.CreateReq, historyMessages []*entity.Message, files []*entity.File) (*entity.Message, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Prompt cannot be empty")
	}

	// Build message content
	data := llm.ContentMessage{
		Content: prompt,
		Files:   files,
	}
	content := llm.Content{
		Type: consts.MessageType.Message,
		Data: data,
	}
	contentByte, err := json.Marshal([]llm.Content{content})
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to marshal message content")
	}

	// Determine parent ID
	var parentId string
	if len(historyMessages) > 0 {
		parentId = historyMessages[len(historyMessages)-1].Id
	}

	// Create message entity
	newMessage := &entity.Message{
		Id:             req.Id,
		ConversationId: req.ConversationId,
		ParentId:       parentId,
		Role:           consts.UserRole.User,
		Content:        string(contentByte),
		MetaInfo:       "{}",
	}

	// Insert message (ignore duplicate key errors for idempotency)
	_, err = dao.Message.Ctx(ctx).Insert(newMessage)
	if err != nil && !isDuplicateKeyError(err) {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to save message")
	}

	return newMessage, nil
}

// isDuplicateKeyError checks if the error is a duplicate key violation.
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "duplicate key") ||
		strings.Contains(errStr, "Duplicate entry") ||
		strings.Contains(errStr, "UNIQUE constraint failed")
}

// validateProviderAndModel validates provider and model configuration.
func (c *ControllerV1) validateProviderAndModel(providerId, modelName string) (*logic.SimpleProviderInfo, *logic.ModelConfig, error) {
	providerInfo := logic.ProviderMap[providerId]
	if providerInfo == nil {
		return nil, nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid provider ID")
	}

	modelConfig := providerInfo.ModelIdMap[modelName]
	if modelConfig == nil {
		return nil, nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid model name")
	}

	return providerInfo, modelConfig, nil
}

// setupSSEResponse configures the response for Server-Sent Events.
func (c *ControllerV1) setupSSEResponse(ctx context.Context) (*ghttp.Response, error) {
	request := g.RequestFromCtx(ctx)
	if request == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid request")
	}

	response := request.Response
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Connection", "keep-alive")
	response.Header().Set("Access-Control-Allow-Origin", "*")

	return response, nil
}
