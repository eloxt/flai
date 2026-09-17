package v1

import "github.com/gogf/gf/v2/frame/g"

type ErrorAlertGetReq struct {
	g.Meta `path:"/error-alert" method:"get" tag:"ErrorAlert(Admin)" summary:"Get LLM error alert settings"`
}

type ErrorAlertGetRes struct {
	BarkURL string `json:"bark_url"`
}

type ErrorAlertUpdateReq struct {
	g.Meta  `path:"/error-alert" method:"put" tag:"ErrorAlert(Admin)" summary:"Update LLM error alert settings"`
	BarkURL string `json:"bark_url" v:"max-length:2048"`
}

type ErrorAlertUpdateRes struct{}
