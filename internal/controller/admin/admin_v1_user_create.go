package admin

import (
	"context"
	"errors"
	"strings"

	v1 "flai/api/admin/v1"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/model/entity"
	"flai/utility"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/google/uuid"
	"github.com/lib/pq"
)

func (c *ControllerV1) UserCreate(ctx context.Context, req *v1.UserCreateReq) (res *v1.UserCreateRes, err error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	// Check if email already exists
	var existingUser *entity.User
	err = dao.User.Ctx(ctx).Where("lower(btrim(email)) = ?", req.Email).Scan(&existingUser)
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
		var conflict *pq.Error
		if errors.As(err, &conflict) && conflict.Code == "23505" && conflict.Constraint == "user_email_active_unique" {
			return nil, gerror.New("Email already exists")
		}
		return nil, err
	}

	// Don't return password
	newUser.Password = ""

	return &v1.UserCreateRes{
		User: *newUser,
	}, nil
}
