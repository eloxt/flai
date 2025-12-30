package admin

import (
	"context"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/do"
)

func (c *ControllerV1) UserDelete(ctx context.Context, req *v1.UserDeleteReq) (res *v1.UserDeleteRes, err error) {
	_, err = dao.User.Ctx(ctx).Where(do.User{
		Id: req.Id,
	}).Delete()
	if err != nil {
		return nil, err
	}

	return &v1.UserDeleteRes{}, nil
}
