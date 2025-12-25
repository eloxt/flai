package conversation

import (
	"context"
	"encoding/json"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/logic/llm"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/conversation/v1"
)

func (c *ControllerV1) Detail(ctx context.Context, req *v1.DetailReq) (res *v1.DetailRes, err error) {
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
		return nil, nil
	}
	if conversation.Id == "" {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Conversation not found")
	}

	var messages []*entity.Message
	err = dao.Message.Ctx(ctx).Where(do.Message{
		ConversationId: conversation.Id,
	}).
		WhereNull("deleted_at").
		OrderAsc("created_at").
		Scan(&messages)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch messages")
	}
	res = &v1.DetailRes{}
	for _, msg := range messages {
		var contents []llm.Content
		err = json.Unmarshal([]byte(msg.Content), &contents)
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to unmarshal message content")
		}

		for _, content := range contents {
			switch content.Type {
			case consts.MessageType.Message:
				var cm llm.ContentMessage
				if err := json.Unmarshal([]byte(msg.Content), &cm); err == nil {
					content.Data = cm
				}
			case consts.MessageType.Reasoning:
				var cr llm.ContentReasoning
				if err := json.Unmarshal([]byte(msg.Content), &cr); err == nil {
					content.Data = cr
				}
			}
		}

		var metaInfo llm.MessageMetaInfo
		err = json.Unmarshal([]byte(msg.MetaInfo), &metaInfo)
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to unmarshal message meta info")
		}

		*res = append(*res, v1.MessageResponse{
			ID:        msg.Id,
			ParentID:  msg.ParentId,
			Role:      msg.Role,
			Content:   contents,
			MetaInfo:  metaInfo,
			CreatedAt: msg.CreatedAt,
		})
	}
	return res, nil
}
