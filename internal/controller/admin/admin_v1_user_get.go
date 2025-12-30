package admin

import (
	"context"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) UserGet(ctx context.Context, req *v1.UserGetReq) (res *v1.UserGetRes, err error) {
	var user *entity.User
	err = dao.User.Ctx(ctx).Where(do.User{
		Id: req.Id,
	}).Scan(&user)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, gerror.New("User not found")
	}

	// Don't return password
	user.Password = ""

	return &v1.UserGetRes{
		User: *user,
	}, nil
}
