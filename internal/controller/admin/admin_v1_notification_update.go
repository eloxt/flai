package admin

import (
	"context"
	"flai/internal/consts"
	"flai/internal/logic"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	v1 "flai/api/admin/v1"
)

func (c *ControllerV1) NotificationUpdate(ctx context.Context, req *v1.NotificationUpdateReq) (res *v1.NotificationUpdateRes, err error) {
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

	// Find and update the notification by ID
	found := false
	for i, item := range notificationList {
		notification, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if notification["id"] == req.Id {
			found = true
			if req.Title != "" {
				notification["title"] = req.Title
			}
			if req.Content != "" {
				notification["content"] = req.Content
			}
			if req.Level != "" {
				notification["level"] = req.Level
			}
			notificationList[i] = notification
			break
		}
	}

	if !found {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Notification not found")
	}

	notificationConfig["list"] = notificationList
	err = logic.SaveSystemConfigToDB(ctx, consts.SystemConfig.Notification, notificationConfig)
	if err != nil {
		return nil, err
	}

	res = &v1.NotificationUpdateRes{
		Id:      req.Id,
		Title:   req.Title,
		Content: req.Content,
		Level:   req.Level,
	}
	return
}
