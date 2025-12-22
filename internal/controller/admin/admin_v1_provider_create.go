package admin

import (
	"context"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/admin/v1"
)

func (c *ControllerV1) ProviderCreate(ctx context.Context, req *v1.ProviderCreateReq) (res *v1.ProviderCreateRes, err error) {
	return nil, gerror.NewCode(gcode.CodeNotImplemented)
}
