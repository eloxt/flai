package admin

import (
	"context"
	"flai/internal/consts"
	"flai/internal/logic"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	v1 "flai/api/admin/v1"
)

func (c *ControllerV1) NotificationDelete(ctx context.Context, req *v1.NotificationDeleteReq) (res *v1.NotificationDeleteRes, err error) {
	notificationConfig, err := logic.GetSystemConfigFromDB(ctx, consts.SystemConfig.Notification)
	if err != nil {
		return nil, err
	}
	if notificationConfig == nil {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Notification config not found")
	}

	notificationList, ok := notificationConfig["list"].([]any)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Notification list not found")
	}

	// Find and remove the notification by ID
	newList := make([]any, 0, len(notificationList))
	found := false
	for _, item := range notificationList {
		notification, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if notification["id"] == req.Id {
			found = true
			continue
		}
		newList = append(newList, notification)
	}

	if !found {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Notification not found")
	}

	notificationConfig["list"] = newList
	err = logic.SaveSystemConfigToDB(ctx, consts.SystemConfig.Notification, notificationConfig)
	if err != nil {
		return nil, err
	}

	res = &v1.NotificationDeleteRes{}
	return
}
