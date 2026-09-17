package message

import (
	"context"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/database/gdb"
	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/message/v1"
)

func (c *ControllerV1) Delete(ctx context.Context, req *v1.DeleteReq) (res *v1.DeleteRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	ids := req.Ids
	if req.Id != "" {
		ids = []string{req.Id}
	}
	if len(ids) == 0 {
		return nil, gerror.New("Message IDs are required")
	}
	err = dao.Message.Transaction(ctx, func(ctx context.Context, tx gdb.TX) error {
		var conversation *entity.Conversation
		if err := dao.Conversation.Ctx(ctx).Where(do.Conversation{Id: req.ConversationId, UserId: user.Id}).LockUpdate().Scan(&conversation); err != nil {
			return err
		}
		if conversation == nil {
			return gerror.NewCode(gcode.CodeNotFound, "Conversation not found")
		}
		var messages []*entity.Message
		if err := dao.Message.Ctx(ctx).Where("conversation_id", req.ConversationId).LockUpdate().Scan(&messages); err != nil {
			return err
		}
		byID := make(map[string]*entity.Message, len(messages))
		for _, msg := range messages {
			byID[msg.Id] = msg
		}
		deleting := make(map[string]bool, len(ids))
		for _, id := range ids {
			if byID[id] == nil {
				return gerror.NewCode(gcode.CodeNotFound, "Message not found")
			}
			deleting[id] = true
		}
		// Derive children and surviving parents from the stored tree, never from the request.
		for _, msg := range messages {
			if deleting[msg.Id] || !deleting[msg.ParentId] {
				continue
			}
			parent := msg.ParentId
			seen := make(map[string]bool)
			for deleting[parent] {
				if seen[parent] {
					return gerror.New("Invalid message tree")
				}
				seen[parent] = true
				parent = byID[parent].ParentId
			}
			if _, err := dao.Message.Ctx(ctx).Where(do.Message{Id: msg.Id, ConversationId: req.ConversationId}).Data("parent_id", parent).Update(); err != nil {
				return err
			}
		}
		_, err := dao.Message.Ctx(ctx).Where(do.Message{Id: ids, ConversationId: req.ConversationId}).Delete()
		return err
	})
	if err != nil {
		return nil, err
	}
	return &v1.DeleteRes{}, nil
}
