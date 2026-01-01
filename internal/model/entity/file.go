// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// File is the golang structure for table file.
type File struct {
	Id        string      `json:"id"         orm:"id"         description:""` //
	UserId    string      `json:"user_id"    orm:"user_id"    description:""` //
	Hash      string      `json:"hash"       orm:"hash"       description:""` //
	FileName  string      `json:"file_name"  orm:"file_name"  description:""` //
	MimeType  string      `json:"mime_type"  orm:"mime_type"  description:""` //
	Size      int         `json:"size"       orm:"size"       description:""` //
	Path      string      `json:"path"       orm:"path"       description:""` //
	CreatedAt *gtime.Time `json:"created_at" orm:"created_at" description:""` //
	PublicUrl string      `json:"public_url" orm:"public_url" description:""` //
}
