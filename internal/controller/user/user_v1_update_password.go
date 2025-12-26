package user

import (
	"context"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/utility"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/user/v1"
)

func (c *ControllerV1) UpdatePassword(ctx context.Context, req *v1.UpdatePasswordReq) (res *v1.UpdatePasswordRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	// Verify old password
	err = dao.User.Ctx(ctx).Where(do.User{
		Id: user.Id,
	}).Scan(&user)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch user")
	}
	if err = utility.VerifyPassword(user.Password, req.OldPassword); err != nil {
		return nil, gerror.New("Invalid old password")
	}

	// Update password
	hashedPassword, err := utility.HashPassword(req.Password)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to hash password")
	}
	_, err = dao.User.Ctx(ctx).Data(do.User{
		Password: hashedPassword,
	}).Where(do.User{
		Id: user.Id,
	}).Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to update user")
	}
	return &v1.UpdatePasswordRes{}, nil
}
