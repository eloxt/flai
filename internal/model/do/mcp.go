// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package do

import (
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gtime"
)

// Mcp is the golang structure of table mcp for DAO operations like Where/Data.
type Mcp struct {
	g.Meta         `orm:"table:mcp, do:true"`
	Id             any         //
	UserId         any         //
	Name           any         //
	ConnectionType any         //
	Endpoint       any         //
	Headers        any         //
	Tools          any         //
	CreatedAt      *gtime.Time //
	UpdatedAt      *gtime.Time //
	DeletedAt      *gtime.Time //
	IsActive       any         //
}
