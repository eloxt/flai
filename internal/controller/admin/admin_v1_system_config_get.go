package admin

import (
	"context"

	"flai/internal/logic"

	"flai/api/admin/v1"
)

func (c *ControllerV1) SystemConfigGet(ctx context.Context, req *v1.SystemConfigGetReq) (res *v1.SystemConfigGetRes, err error) {
	value, err := logic.GetSystemConfigFromDB(ctx, req.Key)
	if err != nil {
		return nil, err
	}
	if value == nil {
		value = map[string]any{}
	}
	return &v1.SystemConfigGetRes{Value: value}, nil
}
