package notification

import (
	"context"
	"flai/internal/consts"
	"flai/internal/logic"

	v1 "flai/api/notification/v1"
)

func (c *ControllerV1) List(ctx context.Context, req *v1.ListReq) (res *v1.ListRes, err error) {
	notificationConfig, err := logic.GetSystemConfigFromDB(ctx, consts.SystemConfig.Notification)
	if err != nil {
		return &v1.ListRes{}, nil
	}
	if notificationConfig == nil {
		return &v1.ListRes{}, nil
	}

	notificationList, ok := notificationConfig["list"].([]any)
	if !ok {
		return &v1.ListRes{}, nil
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

	return &v1.ListRes{List: result}, nil
}

func getString(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
