package conversation

import (
	"context"
	"flai/internal/dao"
	"flai/internal/logic/llm"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	v1 "flai/api/conversation/v1"
)

func (c *ControllerV1) GenerateTitle(ctx context.Context, req *v1.GenerateTitleReq) (res *v1.GenerateTitleRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}
	var conversation entity.Conversation
	err = dao.Conversation.Ctx(ctx).Where(do.Conversation{
		Id:     req.Id,
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

	var messages []*entity.Message
	err = dao.Message.Ctx(ctx).
		Where(do.Message{ConversationId: conversation.Id}).
		OrderDesc("created_at").
		Limit(2).
		Scan(&messages)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch messages")
	}

	title, err := llm.GenerateTitle(ctx, messages)
	if err != nil {
		return nil, err
	}

	// update conversation in db
	_, err = dao.Conversation.Ctx(ctx).Data(do.Conversation{Title: title.Title, Icon: title.Icon}).Where(do.Conversation{Id: conversation.Id}).Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to update conversation")
	}

	return &v1.GenerateTitleRes{
		Title: title.Title,
		Icon:  title.Icon,
	}, nil
}
