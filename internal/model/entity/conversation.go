// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// Conversation is the golang structure for table conversation.
type Conversation struct {
	Id        string      `json:"id"         orm:"id"         description:""` //
	UserId    string      `json:"user_id"    orm:"user_id"    description:""` //
	Title     string      `json:"title"      orm:"title"      description:""` //
	CreatedAt *gtime.Time `json:"created_at" orm:"created_at" description:""` //
	UpdatedAt *gtime.Time `json:"updated_at" orm:"updated_at" description:""` //
	DeletedAt *gtime.Time `json:"deleted_at" orm:"deleted_at" description:""` //
	Icon      string      `json:"icon"       orm:"icon"       description:""` //
}
