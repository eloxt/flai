// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package do

import (
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gtime"
)

// Share is the golang structure of table share for DAO operations like Where/Data.
type Share struct {
	g.Meta       `orm:"table:share, do:true"`
	Id           any         //
	UserId       any         //
	Conversation any         //
	Message      any         //
	CreatedAt    *gtime.Time //
	DeletedAt    *gtime.Time //
	ExpiresAt    *gtime.Time //
}
