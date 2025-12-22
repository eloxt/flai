package conversation

import (
	"context"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/conversation/v1"
)

func (c *ControllerV1) GetList(ctx context.Context, req *v1.GetListReq) (res *v1.GetListRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	var conversations []*entity.Conversation
	var total int
	err = dao.Conversation.Ctx(ctx).Page(req.Current, req.Size).Where(do.Conversation{
		UserId: user.Id,
	}).
		OrderDesc("created_at").
		ScanAndCount(&conversations, &total, false)
	if err != nil {
		return nil, err
	}
	if nil == conversations {
		conversations = make([]*entity.Conversation, 0)
	}

	return &v1.GetListRes{
		Size:    req.Size,
		Current: req.Current,
		Total:   total,
		Records: conversations,
	}, nil
}
