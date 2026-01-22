package admin

import (
	"context"
	"flai/internal/consts"
	"flai/internal/logic"

	"github.com/google/uuid"

	v1 "flai/api/admin/v1"
)

func (c *ControllerV1) NotificationAdd(ctx context.Context, req *v1.NotificationAddReq) (res *v1.NotificationAddRes, err error) {
	notificationConfig, err := logic.GetSystemConfigFromDB(ctx, consts.SystemConfig.Notification)
	if err != nil {
		return nil, err
	}
	if notificationConfig == nil {
		notificationConfig = make(map[string]any)
	}

	notificationList, ok := notificationConfig["list"].([]any)
	if !ok {
		notificationList = make([]any, 0)
	}

	newNotification := map[string]any{
		"id":      uuid.New().String(),
		"title":   req.Title,
		"content": req.Content,
		"level":   req.Level,
	}

	notificationList = append(notificationList, newNotification)
	notificationConfig["list"] = notificationList

	err = logic.SaveSystemConfigToDB(ctx, consts.SystemConfig.Notification, notificationConfig)
	if err != nil {
		return nil, err
	}

	res = &v1.NotificationAddRes{
		Id:      newNotification["id"].(string),
		Title:   newNotification["title"].(string),
		Content: newNotification["content"].(string),
		Level:   newNotification["level"].(string),
	}
	return
}
