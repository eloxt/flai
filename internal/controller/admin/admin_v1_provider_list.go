package admin

import (
	"context"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/admin/v1"
)

func (c *ControllerV1) ProviderList(ctx context.Context, req *v1.ProviderListReq) (res *v1.ProviderListRes, err error) {
	return nil, gerror.NewCode(gcode.CodeNotImplemented)
}
