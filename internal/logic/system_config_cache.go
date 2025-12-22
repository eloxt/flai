package logic

import (
	"context"
	"encoding/json"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/frame/g"
)

var SystemConfigMap map[string]map[string]any

func UpdateSystemConfigCache(ctx context.Context) {
	var systemConfigList []*entity.SystemConfig
	err := g.DB().Model(&entity.SystemConfig{}).Scan(&systemConfigList)
	if err != nil {
		g.Log().Fatal(ctx, err)
	}

	SystemConfigMap = make(map[string]map[string]any)
	for _, config := range systemConfigList {
		var configValue map[string]any
		err := json.Unmarshal([]byte(config.Value), &configValue)
		if err != nil {
			g.Log().Fatal(ctx, "Failed to unmarshal system config", err)
		}
		SystemConfigMap[config.Key] = configValue
	}
	g.Log().Infof(ctx, "System config cache updated")
}
