// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package mcp

import (
	"context"

	"flai/api/mcp/v1"
)

type IMcpV1 interface {
	List(ctx context.Context, req *v1.ListReq) (res *v1.ListRes, err error)
	Get(ctx context.Context, req *v1.GetReq) (res *v1.GetRes, err error)
	Create(ctx context.Context, req *v1.CreateReq) (res *v1.CreateRes, err error)
	Update(ctx context.Context, req *v1.UpdateReq) (res *v1.UpdateRes, err error)
	Delete(ctx context.Context, req *v1.DeleteReq) (res *v1.DeleteRes, err error)
	RefreshTools(ctx context.Context, req *v1.RefreshToolsReq) (res *v1.RefreshToolsRes, err error)
	CallTool(ctx context.Context, req *v1.CallToolReq) (res *v1.CallToolRes, err error)
}
