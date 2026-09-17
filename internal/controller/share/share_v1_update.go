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
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gtime"

	v1 "flai/api/share/v1"
)

func (c *ControllerV1) Update(ctx context.Context, req *v1.UpdateReq) (res *v1.UpdateRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	var expiresAt *gtime.Time
	if req.ExpiresAt != "" {
		parsed := gtime.NewFromStr(req.ExpiresAt)
		if parsed == nil {
			return nil, gerror.New("Invalid share expiry")
		}
		expiresAt = parsed.UTC()
	}

	// fetch existing share record
	var share *entity.Share
	err = dao.Share.Ctx(ctx).
		Where(dao.Share.Columns().Id, req.Id).
		Where(dao.Share.Columns().UserId, user.Id).
		Scan(&share)
	if err != nil {
		return nil, err
	}
	if share == nil {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Share not found")
	}

	data := g.Map{"expires_at": expiresAt}
	// An expiry-only edit must preserve the exact public snapshot.
	if len(req.MessagePath) > 0 {
		var existingConversation entity.Conversation
		if err := json.Unmarshal([]byte(share.Conversation), &existingConversation); err != nil {
			return nil, err
		}
		var conversation *entity.Conversation
		if err := dao.Conversation.Ctx(ctx).Where(do.Conversation{Id: existingConversation.Id, UserId: user.Id}).Scan(&conversation); err != nil {
			return nil, err
		}
		if conversation == nil {
			return nil, gerror.New("Conversation not found")
		}
		messages, err := dao.FetchMessageHistory(ctx, conversation.Id, req.MessagePath)
		if err != nil {
			return nil, err
		}
		conversationJSON, err := json.Marshal(conversation)
		if err != nil {
			return nil, err
		}
		messagesJSON, err := json.Marshal(messages)
		if err != nil {
			return nil, err
		}
		data["conversation"] = string(conversationJSON)
		data["message"] = string(messagesJSON)
	}

	// update share record
	_, err = dao.Share.Ctx(ctx).
		Where(dao.Share.Columns().Id, req.Id).Where("user_id", user.Id).Data(data).Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to update share")
	}

	return &v1.UpdateRes{}, nil
}
