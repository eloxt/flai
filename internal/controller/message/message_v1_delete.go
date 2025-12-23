package message

import (
	"context"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/message/v1"
)

func (c *ControllerV1) Delete(ctx context.Context, req *v1.DeleteReq) (res *v1.DeleteRes, err error) {
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

	// Delete message
	if req.Id != "" {
		_, err = dao.Message.Ctx(ctx).Delete(do.Message{
			Id:             req.Id,
			ConversationId: req.ConversationId,
		})
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to delete message")
		}
		// Change children's parent
		if len(req.Children) > 0 {
			_, err = dao.Message.Ctx(ctx).Data(do.Message{
				ParentId:       req.ParentId,
				ConversationId: req.ConversationId,
			}).Where(do.Message{
				Id: req.Children,
			}).Update()
			if err != nil {
				return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to delete message")
			}
		}
		return nil, nil
	} else if len(req.Ids) > 0 {
		_, err = dao.Message.Ctx(ctx).Delete(do.Message{
			Id:             req.Ids,
			ConversationId: req.ConversationId,
		})
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to delete message")
		}
		return nil, nil
	}

	return nil, gerror.NewCode(gcode.CodeInternalError, "Ids and id cannot be both empty")
}
