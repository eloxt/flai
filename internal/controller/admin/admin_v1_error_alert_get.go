package admin

import (
	"context"

	"flai/api/admin/v1"
	"flai/internal/consts"
	"flai/internal/logic"
)

func (c *ControllerV1) ErrorAlertGet(ctx context.Context, req *v1.ErrorAlertGetReq) (res *v1.ErrorAlertGetRes, err error) {
	config, err := logic.GetSystemConfigFromDB(ctx, consts.SystemConfig.ErrorAlert)
	if err != nil {
		return nil, err
	}
	barkURL, _ := config["bark_url"].(string)
	return &v1.ErrorAlertGetRes{BarkURL: barkURL}, nil
}
