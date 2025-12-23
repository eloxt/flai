package message

import (
	"context"
	"encoding/json"
	"flai/api/message/v1"
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
)

func (c *ControllerV1) Create(ctx context.Context, req *v1.CreateReq) (res *v1.CreateRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	// Make sure user has access to the conversation
	var conversation entity.Conversation
	err = dao.Conversation.Ctx(ctx).Where(do.Conversation{
		Id:     req.ConversationId,
		UserId: user.Id,
	}).
		WhereNull("deleted_at").
		Scan(&conversation)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch conversation")
	}
	if conversation.Id == "" {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Conversation not found")
	}

	// Fetch message history based on MessagePath
	historyMessages, err := dao.FetchMessageHistory(ctx, req.MessagePath)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch message history")
	}
	if len(historyMessages) != len(req.MessagePath) {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid message path")
	}

	// Save prompt to new message
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Prompt cannot be empty")
	}
	data := llm.ContentMessage{
		Content: prompt,
	}
	content := llm.Content{
		Type: consts.MessageType.Message,
		Data: data,
	}
	contentByte, err := json.Marshal([]llm.Content{content})
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to marshal message content")
	}
	var parentId string
	if len(historyMessages) != 0 {
		parentId = historyMessages[len(historyMessages)-1].Id
	}
	newMessage := &entity.Message{
		Id:             req.Id,
		ConversationId: req.ConversationId,
		ParentId:       parentId,
		Role:           consts.UserRole.User,
		Content:        string(contentByte),
	}
	_, err = dao.Message.Ctx(ctx).Insert(newMessage)
	if err != nil {
		if !strings.Contains(err.Error(), "duplicate key") {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to save message")
		}
	}

	// Get provider and model config
	providerInfo := logic.ProviderMap[req.ProviderId]
	if providerInfo == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid provider ID")
	}
	modelConfig := providerInfo.ModelIdMap[req.ModelName]
	if modelConfig == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid model name")
	}

	request := g.RequestFromCtx(ctx)
	if request == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid request")
	}
	response := request.Response
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Connection", "keep-alive")
	response.Header().Set("Access-Control-Allow-Origin", "*")

	err = llm.StreamChat(ctx, response, providerInfo, modelConfig, historyMessages, newMessage)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to stream message")
	}

	return nil, nil
}
