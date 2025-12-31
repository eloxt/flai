package v1

import (
	"github.com/gogf/gf/v2/frame/g"
)

type ListReq struct {
	g.Meta `path:"/share" method:"get" tag:"Share" summary:"List shares"`
}

type ListRes []ShareListResponse

type ShareListResponse struct {
	Id                string `json:"id"`
	ConversationTitle string `json:"conversation_title"`
	CreatedAt         string `json:"created_at"`
	ExpiresAt         string `json:"expires_at"`
}

type DeleteReq struct {
	g.Meta `path:"/share/{id}" method:"delete" tag:"Share" summary:"Delete share"`
	Id     string `v:"required"`
}

type DeleteRes struct {
}

type CreateReq struct {
	g.Meta         `path:"/share" method:"post" tag:"Share" summary:"Create share"`
	ConversationId string `json:"conversation_id" v:"required"`
	ExpiresAt      string `json:"expires_at"`
}

type CreateRes struct {
	Id string `json:"id"`
}

type CheckReq struct {
	g.Meta `path:"/share/{id}/check" method:"get" tag:"Share" summary:"Check share"`
	Id     string `v:"required"`
}

type CheckRes struct {
	Exists bool   `json:"exists"`
	Id     string `json:"id"`
}

type UpdateReq struct {
	g.Meta    `path:"/share/{id}" method:"put" tag:"Share" summary:"Update share"`
	Id        string `v:"required"`
	ExpiresAt string `json:"expires_at"`
}

type UpdateRes struct {
}
