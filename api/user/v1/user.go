package v1

import "github.com/gogf/gf/v2/frame/g"

type UpdateReq struct {
	g.Meta   `path:"/user" method:"put" tag:"User" summary:"Update user"`
	Username string `json:"username" v:"required"`
	Avatar   string `json:"avatar"`
}

type UpdateRes struct {
}

type UpdatePreferenceReq struct {
	g.Meta     `path:"/user/preference" method:"put" tag:"User" summary:"Update user preference"`
	Preference map[string]any `json:"preference" v:"required"`
}

type UpdatePreferenceRes struct {
	Preference map[string]any `json:"preference"`
}

type UpdatePasswordReq struct {
	g.Meta      `path:"/user/password" method:"put" tag:"User" summary:"Update user password"`
	OldPassword string `json:"old_password" v:"required"`
	Password    string `json:"password" v:"required"`
}

type UpdatePasswordRes struct {
}
