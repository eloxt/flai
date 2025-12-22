// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// Conversation is the golang structure for table conversation.
type Conversation struct {
	Id        string      `json:"id"        orm:"id"         description:""` //
	UserId    string      `json:"userId"    orm:"user_id"    description:""` //
	Title     string      `json:"title"     orm:"title"      description:""` //
	CreatedAt *gtime.Time `json:"createdAt" orm:"created_at" description:""` //
	UpdatedAt *gtime.Time `json:"updatedAt" orm:"updated_at" description:""` //
	DeletedAt *gtime.Time `json:"deletedAt" orm:"deleted_at" description:""` //
	Icon      string      `json:"icon"      orm:"icon"       description:""` //
}
