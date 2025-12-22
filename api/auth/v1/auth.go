package v1

import (
	"flai/internal/model/entity"
	"flai/utility"

	"github.com/gogf/gf/v2/frame/g"
)

type RegisterReq struct {
	g.Meta   `path:"/register" method:"post" tag:"Auth" summary:"Register"`
	Email    string `json:"email" v:"required|email"`
	Username string `json:"username" v:"required|length:5,20"`
	Password string `json:"password"`
}

type RegisterRes struct {
	User  *entity.User       `json:"user"`
	Token *utility.TokenPair `json:"token"`
}

type LoginReq struct {
	g.Meta   `path:"/login" method:"post" tag:"Auth" summary:"Login"`
	Email    string `json:"email" v:"required|email"`
	Password string `json:"password" v:"required"`
}

type LoginRes struct {
	User  *entity.User       `json:"user"`
	Token *utility.TokenPair `json:"token"`
}
