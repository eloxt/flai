// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package do

import (
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gtime"
)

// Message is the golang structure of table message for DAO operations like Where/Data.
type Message struct {
	g.Meta         `orm:"table:message, do:true"`
	Id             any         //
	ConversationId any         //
	ParentId       any         //
	Content        any         //
	CreatedAt      *gtime.Time //
	DeletedAt      *gtime.Time //
	Role           any         //
	MetaInfo       any         //
}
