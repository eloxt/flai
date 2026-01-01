package share

import (
	"context"
	"encoding/json"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/os/gtime"

	v1 "flai/api/share/v1"
)

func (c *ControllerV1) Update(ctx context.Context, req *v1.UpdateReq) (res *v1.UpdateRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	// fetch existing share record
	var share entity.Share
	err = dao.Share.Ctx(ctx).
		Where(dao.Share.Columns().Id, req.Id).
		Where(dao.Share.Columns().UserId, user.Id).
		Scan(&share)
	if err != nil {
		return nil, err
	}
	if share.Id == "" {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Share not found")
	}

	// parse existing conversation to get conversation id
	var existingConversation entity.Conversation
	err = json.Unmarshal([]byte(share.Conversation), &existingConversation)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to parse conversation")
	}

	// fetch fresh conversation
	var conversation entity.Conversation
	err = dao.Conversation.Ctx(ctx).
		Where(dao.Conversation.Columns().Id, existingConversation.Id).
		Where(dao.Conversation.Columns().UserId, user.Id).
		Scan(&conversation)
	if err != nil {
		return nil, err
	}
	if conversation.Id == "" {
		return nil, gerror.New("Conversation not found")
	}
	conversationJsonStr, err := json.Marshal(conversation)
	if err != nil {
		return nil, err
	}

	// fetch messages by path if provided, otherwise fetch all
	var messages []*entity.Message
	if len(req.MessagePath) > 0 {
		err = dao.Message.Ctx(ctx).
			Where(dao.Message.Columns().ConversationId, existingConversation.Id).
			WhereIn(dao.Message.Columns().Id, req.MessagePath).
			Scan(&messages)
	} else {
		err = dao.Message.Ctx(ctx).
			Where(dao.Message.Columns().ConversationId, existingConversation.Id).
			Scan(&messages)
	}
	if err != nil {
		return nil, err
	}
	if len(messages) == 0 {
		return nil, gerror.New("No message to share")
	}
	messagesJsonString, err := json.Marshal(messages)
	if err != nil {
		return nil, err
	}

	// update share record
	_, err = dao.Share.Ctx(ctx).
		Where(dao.Share.Columns().Id, req.Id).
		Data(do.Share{
			Conversation: string(conversationJsonStr),
			Message:      string(messagesJsonString),
			ExpiresAt:    gtime.NewFromStr(req.ExpiresAt),
		}).Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to update share")
	}

	return &v1.UpdateRes{}, nil
}
