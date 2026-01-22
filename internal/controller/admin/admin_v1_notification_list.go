package admin

import (
	"context"
	"flai/internal/consts"
	"flai/internal/logic"

	v1 "flai/api/admin/v1"
)

func (c *ControllerV1) NotificationList(ctx context.Context, req *v1.NotificationListReq) (res *v1.NotificationListRes, err error) {
	notificationConfig, ok := logic.SystemConfigMap[consts.SystemConfig.Notification]
	if !ok {
		return &v1.NotificationListRes{List: []v1.NotificationItem{}}, nil
	}

	notificationList, ok := notificationConfig["list"].([]any)
	if !ok {
		return &v1.NotificationListRes{List: []v1.NotificationItem{}}, nil
	}

	result := make([]v1.NotificationItem, 0, len(notificationList))
	for _, item := range notificationList {
		notification, ok := item.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, v1.NotificationItem{
			Id:      getString(notification, "id"),
			Title:   getString(notification, "title"),
			Content: getString(notification, "content"),
			Level:   getString(notification, "level"),
		})
	}

	return &v1.NotificationListRes{List: result}, nil
}

func getString(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
