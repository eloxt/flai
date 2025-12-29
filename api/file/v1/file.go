package v1

import (
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
)

type UserFileListReq struct {
	g.Meta `path:"/user/file" method:"get" tag:"File" summary:"List user files"`
}

type UserFileListRes []*entity.File

type UploadFileReq struct {
	g.Meta `path:"/user/file" method:"post" mime:"multipart/form-data" tag:"File" summary:"Upload file"`
	File   *ghttp.UploadFile `p:"file" type:"file" dc:"File to upload" v:"required"`
}

type UploadFileRes entity.File

type DeleteFileReq struct {
	g.Meta `path:"/user/file/{id}" method:"delete" tag:"File" summary:"Delete file"`
	Id     string   `v:"required"`
	Ids    []string `json:"ids"`
}

type DeleteFileRes struct {
}
