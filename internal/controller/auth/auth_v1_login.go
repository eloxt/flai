package auth

import (
	"context"
	"encoding/json"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/model/do"
	"flai/internal/model/entity"
	"flai/utility"

	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/auth/v1"
)

func (c *ControllerV1) Login(ctx context.Context, req *v1.LoginReq) (res *v1.LoginRes, err error) {
	var user *entity.User
	err = dao.User.Ctx(ctx).Where(do.User{
		Email: req.Email,
	}).Scan(&user)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, gerror.New("Invalid email or password")
	}

	if err = utility.VerifyPassword(user.Password, req.Password); err != nil {
		return nil, gerror.New("Invalid email or password")
	}

	if user.IsActive != 1 {
		return nil, gerror.NewCode(consts.NotActivated, "User is not active")
	}

	token, err := utility.TokenManagerInstance.GenerateTokenPair(user)
	if err != nil {
		return nil, gerror.Wrap(err, `Generate access token failed`)
	}

	var preference map[string]any
	err = json.Unmarshal([]byte(user.Preference), &preference)
	if err != nil {
		return nil, err
	}
	res = &v1.LoginRes{
		User: v1.LoginUser{
			Id:         user.Id,
			Email:      user.Email,
			Username:   user.Username,
			Role:       user.Role,
			IsActive:   user.IsActive,
			CreatedAt:  user.CreatedAt,
			UpdatedAt:  user.UpdatedAt,
			DeletedAt:  user.DeletedAt,
			Avatar:     user.Avatar,
			Preference: preference,
		},
		Token: token,
	}
	return res, nil
}
