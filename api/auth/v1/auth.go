package v1

import (
	"flai/internal/model/entity"
	"flai/utility"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gtime"
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
	User  LoginUser          `json:"user"`
	Token *utility.TokenPair `json:"token"`
}

type LoginUser struct {
	Id         string         `json:"id"         ` //
	Email      string         `json:"email"      ` //
	Username   string         `json:"username"   ` //
	Password   string         `json:"password"   ` //
	Role       string         `json:"role"       ` //
	IsActive   int            `json:"is_active"  ` // IsActive indicates whether the user account is active, represented as an integer flag (e.g., 0 for inactive, 1 for active).
	CreatedAt  *gtime.Time    `json:"created_at" ` //
	UpdatedAt  *gtime.Time    `json:"updated_at" ` //
	DeletedAt  *gtime.Time    `json:"deleted_at" ` //
	Avatar     string         `json:"avatar"     ` //
	Preference map[string]any `json:"preference" ` //
}
