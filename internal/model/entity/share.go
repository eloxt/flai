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
	UserId       string      `json:"userId"       orm:"user_id"      description:""` //
	Conversation string      `json:"conversation" orm:"conversation" description:""` //
	Message      string      `json:"message"      orm:"message"      description:""` //
	CreatedAt    *gtime.Time `json:"createdAt"    orm:"created_at"   description:""` //
	DeletedAt    *gtime.Time `json:"deletedAt"    orm:"deleted_at"   description:""` //
	ExpiresAt    *gtime.Time `json:"expiresAt"    orm:"expires_at"   description:""` //
}
