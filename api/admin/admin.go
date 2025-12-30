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
	ProviderGet(ctx context.Context, req *v1.ProviderGetReq) (res *v1.ProviderGetRes, err error)
	ProviderUpdate(ctx context.Context, req *v1.ProviderUpdateReq) (res *v1.ProviderUpdateRes, err error)
	ProviderDelete(ctx context.Context, req *v1.ProviderDeleteReq) (res *v1.ProviderDeleteRes, err error)
	UserCreate(ctx context.Context, req *v1.UserCreateReq) (res *v1.UserCreateRes, err error)
	UserList(ctx context.Context, req *v1.UserListReq) (res *v1.UserListRes, err error)
	UserGet(ctx context.Context, req *v1.UserGetReq) (res *v1.UserGetRes, err error)
	UserUpdate(ctx context.Context, req *v1.UserUpdateReq) (res *v1.UserUpdateRes, err error)
	UserDelete(ctx context.Context, req *v1.UserDeleteReq) (res *v1.UserDeleteRes, err error)
}
