// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// Provider is the golang structure for table provider.
type Provider struct {
	Id           string      `json:"id"           orm:"id"            description:""` //
	Name         string      `json:"name"         orm:"name"          description:""` //
	ApiKey       string      `json:"apiKey"       orm:"api_key"       description:""` //
	ProviderType string      `json:"providerType" orm:"provider_type" description:""` //
	BaseUrl      string      `json:"baseUrl"      orm:"base_url"      description:""` //
	Model        string      `json:"model"        orm:"model"         description:""` //
	IsActive     int64       `json:"isActive"     orm:"is_active"     description:""` //
	CreatedAt    *gtime.Time `json:"createdAt"    orm:"created_at"    description:""` //
	UpdatedAt    *gtime.Time `json:"updatedAt"    orm:"updated_at"    description:""` //
	DeletedAt    *gtime.Time `json:"deletedAt"    orm:"deleted_at"    description:""` //
}
