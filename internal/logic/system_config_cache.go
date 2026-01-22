package logic

import (
	"context"
	"encoding/json"
	"flai/internal/model/do"
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

func UpdateSystemConfig(ctx context.Context, key string, value map[string]any) {
	SystemConfigMap[key] = value
	jsonBytes, err := json.Marshal(value)
	if err != nil {
		g.Log().Error(ctx, err)
		return
	}
	jsonString := string(jsonBytes)
	_, err = g.DB().Model(&entity.SystemConfig{}).Where(do.SystemConfig{
		Key: key,
	}).Update(g.Map{"value": jsonString})
	if err != nil {
		g.Log().Error(ctx, err)
		return
	}
}
