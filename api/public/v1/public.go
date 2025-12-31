package v1

import (
	v1 "flai/api/conversation/v1"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/frame/g"
)

type DetailReq struct {
	g.Meta `path:"/share/{id}" method:"get" tag:"Share" summary:"Get share detail"`
	Id     string `v:"required"`
}

type DetailRes struct {
	Id           string                `json:"id"`
	UserId       string                `json:"user_id"`
	Conversation entity.Conversation   `json:"conversation"`
	Message      []*v1.MessageResponse `json:"message"`
	CreatedAt    string                `json:"created_at"`
	ExpiresAt    string                `json:"expires_at"`
}
