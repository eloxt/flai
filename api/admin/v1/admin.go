package v1

import (
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/frame/g"
)

// ==================== Provider APIs ====================

type ProviderCreateReq struct {
	g.Meta       `path:"/provider" method:"post" tag:"Provider(Admin)" summary:"Create Provider"`
	Name         string `json:"name" v:"required"`
	APIKey       string `json:"api_key"`
	ProviderType string `json:"provider_type"`
	BaseURL      string `json:"base_url"`
	Models       any    `json:"models"`
	IsActive     bool   `json:"is_active"`
	Logo         string `json:"logo"`
}

type ProviderCreateRes entity.Provider

type ProviderListReq struct {
	g.Meta `path:"/provider" method:"get" tag:"Provider(Admin)" summary:"List Providers"`
}

type ProviderListRes []ProviderResponse

type ProviderResponse struct {
	Id           string           `json:"id"`
	Name         string           `json:"name"`
	ApiKey       string           `json:"api_key"`
	ProviderType string           `json:"provider_type"`
	BaseUrl      string           `json:"base_url"`
	Model        []map[string]any `json:"model"`
	IsActive     int              `json:"is_active"`
	CreatedAt    string           `json:"created_at"`
	UpdatedAt    string           `json:"updated_at"`
	DeletedAt    string           `json:"deleted_at"`
	Logo         string           `json:"logo"`
}

type ProviderGetReq struct {
	g.Meta `path:"/provider/{id}" method:"get" tag:"Provider(Admin)" summary:"Get Provider by ID"`
	Id     string `json:"id" in:"path" v:"required"`
}

type ProviderGetRes entity.Provider

type ProviderUpdateReq struct {
	g.Meta       `path:"/provider/{id}" method:"put" tag:"Provider(Admin)" summary:"Update Provider"`
	Id           string `json:"id" in:"path" v:"required"`
	Name         string `json:"name"`
	APIKey       string `json:"api_key"`
	ProviderType string `json:"provider_type"`
	BaseURL      string `json:"base_url"`
	Models       any    `json:"models"`
	IsActive     *bool  `json:"is_active"`
	Logo         string `json:"logo"`
}

type ProviderUpdateRes struct{}

type ProviderDeleteReq struct {
	g.Meta `path:"/provider/{id}" method:"delete" tag:"Provider(Admin)" summary:"Delete Provider"`
	Id     string `json:"id" in:"path" v:"required"`
}

type ProviderDeleteRes struct{}

// ==================== User APIs ====================

type UserCreateReq struct {
	g.Meta   `path:"/user" method:"post" tag:"User(Admin)" summary:"Create user"`
	Email    string `json:"email" v:"required|email"`
	Username string `json:"username" v:"required"`
	Password string `json:"password" v:"required|min-length:8"`
	Role     string `json:"role"`
	IsActive *int   `json:"is_active"`
}

type UserCreateRes struct {
	entity.User
}

type UserListReq struct {
	g.Meta `path:"/user" method:"get" tag:"User(Admin)" summary:"List users"`
}

type UserListRes struct {
	List []entity.User `json:"list"`
}

type UserGetReq struct {
	g.Meta `path:"/user/{id}" method:"get" tag:"User(Admin)" summary:"Get user by ID"`
	Id     string `json:"id" in:"path" v:"required"`
}

type UserGetRes struct {
	entity.User
}

type UserUpdateReq struct {
	g.Meta   `path:"/user/{id}" method:"put" tag:"User(Admin)" summary:"Update user"`
	Id       string `json:"id" in:"path" v:"required"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
	IsActive *int   `json:"is_active"`
	Avatar   string `json:"avatar"`
}

type UserUpdateRes struct{}

type UserDeleteReq struct {
	g.Meta `path:"/user/{id}" method:"delete" tag:"User(Admin)" summary:"Delete user"`
	Id     string `json:"id" in:"path" v:"required"`
}

type UserDeleteRes struct{}
