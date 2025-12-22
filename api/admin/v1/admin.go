package v1

import (
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/frame/g"
)

type ProviderCreateReq struct {
	g.Meta   `path:"/provider" method:"post" tag:"Provider(Admin)" summary:"Create Provider"`
	Name     string `json:"name" v:"required"`
	APIKey   string `json:"api_key"`
	BaseURL  string `json:"base_url"`
	Model    string `json:"model"`
	IsActive bool   `json:"is_active"`
}

type ProviderCreateRes struct {
	Id string `json:"id"`
}

type ProviderListReq struct {
	g.Meta `path:"/provider" method:"get" tag:"Provider" summary:"List Providers(admin)"`
}

type ProviderListRes []*entity.Provider

type UserCreateReq struct {
	g.Meta   `path:"/user" method:"post" tag:"User" summary:"Create user"`
	Email    string `json:"email" v:"required"`
	Username string `json:"username" v:"required"`
	Password string `json:"password" v:"required"`
}

type UserCreateRes struct {
	entity.User
}

type UserDeleteReq struct {
	g.Meta `path:"/user" method:"delete" tag:"User" summary:"Delete user"`
	Id     string `v:"required"`
}

type UserDeleteRes struct{}

type UserGetListReq struct {
	g.Meta `path:"/user" method:"get" tag:"List" summary:"List users"`
}

type UserGetListRes struct {
	List []entity.User `json:"list"`
}
