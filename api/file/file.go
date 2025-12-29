// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package file

import (
	"context"

	"flai/api/file/v1"
)

type IFileV1 interface {
	UserFileList(ctx context.Context, req *v1.UserFileListReq) (res *v1.UserFileListRes, err error)
	UploadFile(ctx context.Context, req *v1.UploadFileReq) (res *v1.UploadFileRes, err error)
	DeleteFile(ctx context.Context, req *v1.DeleteFileReq) (res *v1.DeleteFileRes, err error)
}
