package admin

import (
	"context"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/do"
	"flai/utility"
)

func (c *ControllerV1) UserUpdate(ctx context.Context, req *v1.UserUpdateReq) (res *v1.UserUpdateRes, err error) {
	updateData := do.User{}

	if req.Email != "" {
		updateData.Email = req.Email
	}
	if req.Username != "" {
		updateData.Username = req.Username
	}
	if req.Password != "" {
		hashedPassword, err := utility.HashPassword(req.Password)
		if err != nil {
			return nil, err
		}
		updateData.Password = hashedPassword
	}
	if req.Role != "" {
		updateData.Role = req.Role
	}
	if req.IsActive != nil {
		updateData.IsActive = *req.IsActive
	}
	if req.Avatar != "" {
		updateData.Avatar = req.Avatar
	}

	_, err = dao.User.Ctx(ctx).Where(do.User{
		Id: req.Id,
	}).Data(updateData).Update()
	if err != nil {
		return nil, err
	}

	return &v1.UserUpdateRes{}, nil
}
