// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package user

import (
	"context"

	"flai/api/user/v1"
)

type IUserV1 interface {
	Update(ctx context.Context, req *v1.UpdateReq) (res *v1.UpdateRes, err error)
	UpdatePassword(ctx context.Context, req *v1.UpdatePasswordReq) (res *v1.UpdatePasswordRes, err error)
}
