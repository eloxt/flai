package admin

import (
	"context"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/entity"
)

func (c *ControllerV1) UserList(ctx context.Context, req *v1.UserListReq) (res *v1.UserListRes, err error) {
	var users []entity.User
	err = dao.User.Ctx(ctx).Scan(&users)
	if err != nil {
		return nil, err
	}

	// Remove passwords from response
	for i := range users {
		users[i].Password = ""
	}

	return &v1.UserListRes{
		List: users,
	}, nil
}
