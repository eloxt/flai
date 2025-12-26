package user

import (
	"context"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/user/v1"
)

func (c *ControllerV1) Update(ctx context.Context, req *v1.UpdateReq) (res *v1.UpdateRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}
	_, err = dao.User.Ctx(ctx).Data(do.User{
		Username: req.Username,
		Avatar:   req.Avatar,
	}).Where(do.User{
		Id: user.Id,
	}).Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to update user")
	}
	return &v1.UpdateRes{}, nil
}
