// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// Message is the golang structure for table message.
type Message struct {
	Id             string      `json:"id"              orm:"id"              description:""` //
	ConversationId string      `json:"conversation_id" orm:"conversation_id" description:""` //
	ParentId       string      `json:"parent_id"       orm:"parent_id"       description:""` //
	Content        string      `json:"content"         orm:"content"         description:""` //
	CreatedAt      *gtime.Time `json:"created_at"      orm:"created_at"      description:""` //
	DeletedAt      *gtime.Time `json:"deleted_at"      orm:"deleted_at"      description:""` //
	Role           string      `json:"role"            orm:"role"            description:""` //
	MetaInfo       string      `json:"meta_info"       orm:"meta_info"       description:""` //
}
