package admin

import (
	"context"

	v1 "flai/api/admin/v1"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/model/do"
	"flai/internal/model/entity"
	"flai/utility"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/google/uuid"
)

func (c *ControllerV1) UserCreate(ctx context.Context, req *v1.UserCreateReq) (res *v1.UserCreateRes, err error) {
	// Check if email already exists
	var existingUser *entity.User
	err = dao.User.Ctx(ctx).Where(do.User{
		Email: req.Email,
	}).Scan(&existingUser)
	if err != nil {
		return nil, err
	}
	if existingUser != nil {
		return nil, gerror.New("Email already exists")
	}

	// Hash password
	hashedPassword, err := utility.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	// Set default role if not provided
	role := req.Role
	if role == "" {
		role = consts.UserRole.User
	}

	// Set default is_active
	isActive := 1
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	newUser := &entity.User{
		Id:       uuid.New().String(),
		Email:    req.Email,
		Username: req.Username,
		Password: hashedPassword,
		Role:     role,
		IsActive: isActive,
	}

	_, err = dao.User.Ctx(ctx).Insert(newUser)
	if err != nil {
		return nil, err
	}

	// Don't return password
	newUser.Password = ""

	return &v1.UserCreateRes{
		User: *newUser,
	}, nil
}
