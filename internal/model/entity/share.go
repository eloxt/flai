// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// Share is the golang structure for table share.
type Share struct {
	Id           string      `json:"id"           orm:"id"           description:""` //
	UserId       string      `json:"user_id"      orm:"user_id"      description:""` //
	Conversation string      `json:"conversation" orm:"conversation" description:""` //
	Message      string      `json:"message"      orm:"message"      description:""` //
	CreatedAt    *gtime.Time `json:"created_at"   orm:"created_at"   description:""` //
	DeletedAt    *gtime.Time `json:"deleted_at"   orm:"deleted_at"   description:""` //
	ExpiresAt    *gtime.Time `json:"expires_at"   orm:"expires_at"   description:""` //
}
