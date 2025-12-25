// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// User is the golang structure for table user.
type User struct {
	Id        string      `json:"id"         orm:"id"         description:""` //
	Email     string      `json:"email"      orm:"email"      description:""` //
	Username  string      `json:"username"   orm:"username"   description:""` //
	Password  string      `json:"password"   orm:"password"   description:""` //
	Role      string      `json:"role"       orm:"role"       description:""` //
	IsActive  int         `json:"is_active"  orm:"is_active"  description:""` //
	CreatedAt *gtime.Time `json:"created_at" orm:"created_at" description:""` //
	UpdatedAt *gtime.Time `json:"updated_at" orm:"updated_at" description:""` //
	DeletedAt *gtime.Time `json:"deleted_at" orm:"deleted_at" description:""` //
}
