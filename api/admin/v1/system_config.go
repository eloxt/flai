package v1

import "github.com/gogf/gf/v2/frame/g"

type SystemConfigGetReq struct {
	g.Meta `path:"/system-config/{key}" method:"get" tag:"SystemConfig(Admin)" summary:"Get prompt or title generation settings"`
	Key    string `json:"key" v:"required|in:system_prompt,title_generation"`
}

type SystemConfigGetRes struct {
	Value map[string]any `json:"value"`
}

type SystemConfigUpdateReq struct {
	g.Meta `path:"/system-config/{key}" method:"put" tag:"SystemConfig(Admin)" summary:"Update prompt or title generation settings"`
	Key    string         `json:"key" v:"required|in:system_prompt,title_generation"`
	Value  map[string]any `json:"value" v:"required"`
}

type SystemConfigUpdateRes struct{}
