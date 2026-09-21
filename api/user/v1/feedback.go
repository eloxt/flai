package v1

import "github.com/gogf/gf/v2/frame/g"

type FeedbackReq struct {
	g.Meta  `path:"/user/feedback" method:"post" tag:"User" summary:"Send feedback to the administrator"`
	Content string `json:"content" v:"required|max-length:2000"`
}

type FeedbackRes struct{}
