package conversation

import (
	"context"
	"flai/api/conversation/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"

	"github.com/gogf/gf/v2/database/gdb"
	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) Delete(ctx context.Context, req *v1.DeleteReq) (res *v1.DeleteRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	conversationId := req.Id
	err = dao.Conversation.Transaction(ctx, func(ctx context.Context, tx gdb.TX) error {
		result, err := dao.Conversation.Ctx(ctx).Delete(do.Conversation{
			Id:     conversationId,
			UserId: user.Id,
		})
		if err != nil {
			return gerror.WrapCode(gcode.CodeInternalError, err, "Failed to delete conversation")
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if affected == 0 {
			return gerror.NewCode(gcode.CodeNotFound, "Conversation not found")
		}
		_, err = dao.Message.Ctx(ctx).Delete(do.Message{
			ConversationId: conversationId,
		})
		if err != nil {
			return gerror.WrapCode(gcode.CodeInternalError, err, "Failed to delete messages")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &v1.DeleteRes{}, nil
}
