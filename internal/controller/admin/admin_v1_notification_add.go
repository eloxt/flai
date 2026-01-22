package admin

import (
	"context"
	"flai/internal/consts"
	"flai/internal/logic"

	"github.com/google/uuid"

	"flai/api/admin/v1"
)

func (c *ControllerV1) NotificationAdd(ctx context.Context, req *v1.NotificationAddReq) (res *v1.NotificationAddRes, err error) {
	notificationConfig, ok := logic.SystemConfigMap[consts.SystemConfig.Notification]
	if !ok {
		notificationConfig = make(map[string]any)
	}

	notificationList, ok := notificationConfig["list"].([]map[string]any)
	if !ok {
		notificationList = make([]map[string]any, 0)
	}

	newNotification := map[string]any{
		"id":      uuid.New().String(),
		"title":   req.Title,
		"content": req.Content,
		"level":   req.Level,
	}

	notificationList = append(notificationList, newNotification)
	notificationConfig["list"] = notificationList
	logic.UpdateSystemConfig(ctx, consts.SystemConfig.Notification, notificationConfig)

	res = &v1.NotificationAddRes{
		Id:      newNotification["id"].(string),
		Title:   newNotification["title"].(string),
		Content: newNotification["content"].(string),
		Level:   newNotification["level"].(string),
	}
	return
}
