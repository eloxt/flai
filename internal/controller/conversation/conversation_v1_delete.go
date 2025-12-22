package conversation

import (
	"context"
	"flai/api/conversation/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) Delete(ctx context.Context, req *v1.DeleteReq) (res *v1.DeleteRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	conversationId := req.Id
	if conversationId == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Conversation ID is required")
	}
	_, err = dao.Conversation.Ctx(ctx).Delete(do.Conversation{
		Id:     conversationId,
		UserId: user.Id,
	})
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to delete conversation")
	}
	_, err = dao.Message.Ctx(ctx).Delete(do.Message{
		ConversationId: conversationId,
	})
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to delete messages")
	}
	return &v1.DeleteRes{}, nil
}
