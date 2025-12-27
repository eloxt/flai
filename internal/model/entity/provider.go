// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// Provider is the golang structure for table provider.
type Provider struct {
	Id           string      `json:"id"            orm:"id"            description:""` //
	Name         string      `json:"name"          orm:"name"          description:""` //
	ApiKey       string      `json:"api_key"       orm:"api_key"       description:""` //
	ProviderType string      `json:"provider_type" orm:"provider_type" description:""` //
	BaseUrl      string      `json:"base_url"      orm:"base_url"      description:""` //
	Model        string      `json:"model"         orm:"model"         description:""` //
	IsActive     int64       `json:"is_active"     orm:"is_active"     description:""` //
	CreatedAt    *gtime.Time `json:"created_at"    orm:"created_at"    description:""` //
	UpdatedAt    *gtime.Time `json:"updated_at"    orm:"updated_at"    description:""` //
	DeletedAt    *gtime.Time `json:"deleted_at"    orm:"deleted_at"    description:""` //
	Logo         string      `json:"logo"          orm:"logo"          description:""` //
}
