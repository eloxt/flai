package conversation

import (
	"context"
	"flai/api/conversation/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) FavouriteList(ctx context.Context, req *v1.FavouriteListReq) (res *v1.FavouriteListRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	var conversations []*entity.Conversation
	err = dao.Conversation.Ctx(ctx).Where(do.Conversation{
		UserId:    user.Id,
		Favourite: 1,
	}).
		OrderDesc("updated_at").
		Scan(&conversations)
	if err != nil {
		return nil, err
	}
	if nil == conversations {
		conversations = make([]*entity.Conversation, 0)
	}

	resList := v1.FavouriteListRes(conversations)
	return &resList, nil
}
