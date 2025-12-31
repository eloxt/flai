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
	"github.com/google/uuid"

	"flai/api/share/v1"
)

func (c *ControllerV1) Create(ctx context.Context, req *v1.CreateReq) (res *v1.CreateRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	// fetch conversation
	var conversation entity.Conversation
	err = dao.Conversation.Ctx(ctx).
		Where(dao.Conversation.Columns().Id, req.ConversationId).
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

	// fetch messages
	var messages []*entity.Message
	err = dao.Message.Ctx(ctx).
		Where(dao.Message.Columns().ConversationId, req.ConversationId).
		Scan(&messages)
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

	// create share
	shareId := uuid.New().String()
	_, err = dao.Share.Ctx(ctx).Data(do.Share{
		Id:           shareId,
		UserId:       user.Id,
		Conversation: string(conversationJsonStr),
		Message:      string(messagesJsonString),
		ExpiresAt:    gtime.NewFromStr(req.ExpiresAt),
	}).Insert()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to create share")
	}

	return &v1.CreateRes{
		Id: shareId,
	}, nil

}
