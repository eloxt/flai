package auth

import (
	"context"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/model/do"
	"flai/internal/model/entity"
	"flai/utility"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/google/uuid"

	"flai/api/auth/v1"
)

func (c *ControllerV1) Register(ctx context.Context, req *v1.RegisterReq) (res *v1.RegisterRes, err error) {
	var tempUser *entity.User
	err = dao.User.Ctx(ctx).Where(do.User{
		Email: req.Email,
	}).Scan(&tempUser)
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
		Id:       uuid.New().String(),
		Username: req.Username,
		Email:    req.Email,
		Password: hashedPassword,
		Role:     consts.UserRole.User,
	}

	_, err = dao.User.Ctx(ctx).Insert(newUser)
	if err != nil {
		return nil, err
	}

	tokenPair, err := utility.TokenManagerInstance.GenerateTokenPair(newUser)
	if err != nil {
		return nil, err
	}

	newUser.Password = ""

	return &v1.RegisterRes{
		User:  newUser,
		Token: tokenPair,
	}, nil
}
