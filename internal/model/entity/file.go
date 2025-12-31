// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// File is the golang structure for table file.
type File struct {
	Id        string      `json:"id"        orm:"id"         description:""` //
	UserId    string      `json:"userId"    orm:"user_id"    description:""` //
	Hash      string      `json:"hash"      orm:"hash"       description:""` //
	FileName  string      `json:"fileName"  orm:"file_name"  description:""` //
	MimeType  string      `json:"mimeType"  orm:"mime_type"  description:""` //
	Size      int         `json:"size"      orm:"size"       description:""` //
	Path      string      `json:"path"      orm:"path"       description:""` //
	CreatedAt *gtime.Time `json:"createdAt" orm:"created_at" description:""` //
	PublicUrl string      `json:"publicUrl" orm:"public_url" description:""` //
}
