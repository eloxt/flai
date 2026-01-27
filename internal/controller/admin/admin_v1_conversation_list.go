package admin

import (
	"context"

	"flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/do"
	"flai/internal/model/entity"
)

func (c *ControllerV1) ConversationList(ctx context.Context, req *v1.ConversationListReq) (res *v1.ConversationListRes, err error) {
	var conversations []*entity.Conversation
	var total int
	err = dao.Conversation.Ctx(ctx).Page(req.Current, req.Size).Where(do.Conversation{
		UserId: req.UserId,
	}).
		OrderDesc("created_at").
		ScanAndCount(&conversations, &total, false)
	if err != nil {
		return nil, err
	}
	if nil == conversations {
		conversations = make([]*entity.Conversation, 0)
	}

	return &v1.ConversationListRes{
		Size:    req.Size,
		Current: req.Current,
		Total:   total,
		Records: conversations,
	}, nil
}
