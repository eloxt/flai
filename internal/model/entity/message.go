// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// Message is the golang structure for table message.
type Message struct {
	Id             string      `json:"id"             orm:"id"              description:""` //
	ConversationId string      `json:"conversationId" orm:"conversation_id" description:""` //
	ParentId       string      `json:"parentId"       orm:"parent_id"       description:""` //
	Content        string      `json:"content"        orm:"content"         description:""` //
	CreatedAt      *gtime.Time `json:"createdAt"      orm:"created_at"      description:""` //
	DeletedAt      *gtime.Time `json:"deletedAt"      orm:"deleted_at"      description:""` //
	Role           string      `json:"role"           orm:"role"            description:""` //
}
