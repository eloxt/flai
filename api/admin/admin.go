// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package admin

import (
	"context"

	"flai/api/admin/v1"
)

type IAdminV1 interface {
	ProviderCreate(ctx context.Context, req *v1.ProviderCreateReq) (res *v1.ProviderCreateRes, err error)
	ProviderList(ctx context.Context, req *v1.ProviderListReq) (res *v1.ProviderListRes, err error)
	UserCreate(ctx context.Context, req *v1.UserCreateReq) (res *v1.UserCreateRes, err error)
	UserDelete(ctx context.Context, req *v1.UserDeleteReq) (res *v1.UserDeleteRes, err error)
	UserGetList(ctx context.Context, req *v1.UserGetListReq) (res *v1.UserGetListRes, err error)
}
