package v1

import "github.com/gogf/gf/v2/frame/g"

type UpdateReq struct {
	g.Meta   `path:"/user" method:"put" tag:"User" summary:"Update user"`
	Username string `json:"username" v:"required"`
	Avatar   string `json:"avatar"`
}

type UpdateRes struct {
}

type UpdatePasswordReq struct {
	g.Meta      `path:"/user/password" method:"put" tag:"User" summary:"Update user password"`
	OldPassword string `json:"old_password" v:"required"`
	Password    string `json:"password" v:"required"`
}

type UpdatePasswordRes struct {
}
