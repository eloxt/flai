// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package do

import (
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gtime"
)

// Provider is the golang structure of table provider for DAO operations like Where/Data.
type Provider struct {
	g.Meta       `orm:"table:provider, do:true"`
	Id           any         //
	Name         any         //
	ApiKey       any         //
	ProviderType any         //
	BaseUrl      any         //
	Model        any         //
	IsActive     any         //
	CreatedAt    *gtime.Time //
	UpdatedAt    *gtime.Time //
	DeletedAt    *gtime.Time //
	Logo         any         //
}
