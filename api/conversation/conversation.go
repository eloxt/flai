// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package conversation

import (
	"context"

	"flai/api/conversation/v1"
)

type IConversationV1 interface {
	Create(ctx context.Context, req *v1.CreateReq) (res *v1.CreateRes, err error)
	Delete(ctx context.Context, req *v1.DeleteReq) (res *v1.DeleteRes, err error)
	GetList(ctx context.Context, req *v1.GetListReq) (res *v1.GetListRes, err error)
	Detail(ctx context.Context, req *v1.DetailReq) (res *v1.DetailRes, err error)
	GenerateTitle(ctx context.Context, req *v1.GenerateTitleReq) (res *v1.GenerateTitleRes, err error)
	Favourite(ctx context.Context, req *v1.FavouriteReq) (res *v1.FavouriteRes, err error)
	Unfavourite(ctx context.Context, req *v1.UnfavouriteReq) (res *v1.UnfavouriteRes, err error)
	FavouriteList(ctx context.Context, req *v1.FavouriteListReq) (res *v1.FavouriteListRes, err error)
	Search(ctx context.Context, req *v1.SearchReq) (res *v1.SearchRes, err error)
}
