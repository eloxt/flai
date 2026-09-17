package auth

import (
	"context"
	"errors"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/model/entity"
	"flai/utility"
	"strings"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/google/uuid"
	"github.com/lib/pq"

	"flai/api/auth/v1"
)

func (c *ControllerV1) Register(ctx context.Context, req *v1.RegisterReq) (res *v1.RegisterRes, err error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	var tempUser *entity.User
	err = dao.User.Ctx(ctx).Where("lower(btrim(email)) = ?", req.Email).Scan(&tempUser)
	if err != nil {
		return nil, err
	}
	if tempUser != nil {
		return nil, gerror.New("Email already exists")
	}

	hashedPassword, err := utility.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	newUser := &entity.User{
		Id:         uuid.New().String(),
		Username:   req.Username,
		Email:      req.Email,
		Password:   hashedPassword,
		Role:       consts.UserRole.User,
		Preference: "{}",
	}

	_, err = dao.User.Ctx(ctx).Insert(newUser)
	if err != nil {
		var conflict *pq.Error
		if errors.As(err, &conflict) && conflict.Code == "23505" && conflict.Constraint == "user_email_active_unique" {
			return nil, gerror.New("Email already exists")
		}
		return nil, err
	}

	newUser.Password = ""
	return &v1.RegisterRes{User: newUser}, nil
}
