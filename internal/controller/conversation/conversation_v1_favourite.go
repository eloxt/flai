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

func (c *ControllerV1) Favourite(ctx context.Context, req *v1.FavouriteReq) (res *v1.FavouriteRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	_, err = dao.Conversation.Ctx(ctx).
		Data(do.Conversation{Favourite: 1}).
		Where(do.Conversation{Id: req.Id, UserId: user.Id}).
		Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to favourite conversation")
	}

	return &v1.FavouriteRes{}, nil
}
