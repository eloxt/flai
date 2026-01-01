// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// Mcp is the golang structure for table mcp.
type Mcp struct {
	Id             string      `json:"id"              orm:"id"              description:""` //
	UserId         string      `json:"user_id"         orm:"user_id"         description:""` //
	Name           string      `json:"name"            orm:"name"            description:""` //
	ConnectionType string      `json:"connection_type" orm:"connection_type" description:""` //
	Endpoint       string      `json:"endpoint"        orm:"endpoint"        description:""` //
	Headers        string      `json:"headers"         orm:"headers"         description:""` //
	Tools          string      `json:"tools"           orm:"tools"           description:""` //
	CreatedAt      *gtime.Time `json:"created_at"      orm:"created_at"      description:""` //
	UpdatedAt      *gtime.Time `json:"updated_at"      orm:"updated_at"      description:""` //
	DeletedAt      *gtime.Time `json:"deleted_at"      orm:"deleted_at"      description:""` //
	IsActive       int         `json:"is_active"       orm:"is_active"       description:""` //
}
