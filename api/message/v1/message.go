package v1

import (
	"github.com/gogf/gf/v2/frame/g"
)

type CreateReq struct {
	g.Meta         `path:"/messages" method:"post" tag:"" summary:"Create message"`
	Id             string   `json:"id" v:"required"`
	ConversationId string   `json:"conversation_id" v:"required"`
	ProviderId     string   `json:"provider_id" v:"required"`
	ModelName      string   `json:"model_name" v:"required"`
	MessagePath    []string `json:"message_path"`
	Prompt         string   `json:"prompt" v:"required"`
}

type CreateRes struct {
}

type RetryReq struct {
	g.Meta         `path:"/messages/retry" method:"post" tag:"" summary:"Retry message"`
	ConversationId string   `json:"conversation_id" v:"required"`
	ProviderId     string   `json:"provider_id" v:"required"`
	ModelName      string   `json:"model_name" v:"required"`
	MessagePath    []string `json:"message_path"`
}

type RetryRes struct {
}

type EditReq struct {
	g.Meta         `path:"/messages/edit" method:"post" tag:"" summary:"Edit message"`
	ConversationId string   `json:"conversation_id" v:"required"`
	ProviderId     string   `json:"provider_id" v:"required"`
	ModelName      string   `json:"model_name" v:"required"`
	MessagePath    []string `json:"message_path"`
	Prompt         string   `json:"prompt"`
}

type EditRes struct{}

type DeleteReq struct {
	g.Meta `path:"/messages/" method:"delete" tag:"" summary:"Delete message"`
	Id     string   `json:"id"`
	Ids    []string `json:"ids"`
}

type DeleteRes struct{}
