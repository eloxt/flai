package message

import (
	"context"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/message/v1"
)

func (c *ControllerV1) Retry(ctx context.Context, req *v1.RetryReq) (res *v1.RetryRes, err error) {
	return nil, gerror.NewCode(gcode.CodeNotImplemented)
}
