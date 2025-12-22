// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package do

import (
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gtime"
)

// Conversation is the golang structure of table conversation for DAO operations like Where/Data.
type Conversation struct {
	g.Meta    `orm:"table:conversation, do:true"`
	Id        any         //
	UserId    any         //
	Title     any         //
	CreatedAt *gtime.Time //
	UpdatedAt *gtime.Time //
	DeletedAt *gtime.Time //
	Icon      any         //
}
