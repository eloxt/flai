package v1

import (
	"flai/internal/logic/llm"
	"flai/internal/model/entity"
	"flai/utility"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gtime"
)

// Create
type CreateReq struct {
	g.Meta `path:"/conversation" method:"post" tag:"Conversation" Summary:"Create a new conversation"`
}

type CreateRes struct {
	Id string `json:"id"`
}

// Delete
type DeleteReq struct {
	g.Meta `path:"/conversation/{id}" method:"delete" tag:"Conversation" Summary:"Delete a conversation"`
	Id     string `v:"required"`
}

type DeleteRes struct {
}

// List
type GetListReq struct {
	g.Meta `path:"/conversation" method:"get" tag:"Conversation" Summary:"Get list of conversations (Logined user)"`
	utility.PageReq
}

type GetListRes utility.PageRes[entity.Conversation]

type DetailReq struct {
	g.Meta `path:"/conversation/{id}" method:"get" tag:"Conversation" Summary:"Get conversation detail"`
	Id     string `v:"required"`
}

type DetailRes []MessageResponse

type MessageResponse struct {
	ID        string              `json:"id"`
	ParentID  string              `json:"parent_id"`
	Role      string              `json:"role"`
	Content   any                 `json:"content"`
	MetaInfo  llm.MessageMetaInfo `json:"meta_info"`
	CreatedAt *gtime.Time         `json:"created_at"`
}

type GenerateTitleReq struct {
	g.Meta `path:"/conversation/{id}/generate-title" method:"get" tag:"Conversation" Summary:"Generate title for a conversation"`
	Id     string `v:"required"`
}

type GenerateTitleRes struct {
	Title string `json:"title" v:"required"`
	Icon  string `json:"icon"`
}

// TODO: rename
