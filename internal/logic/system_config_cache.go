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

// GetSystemConfigFromDB reads config directly from database (no cache)
func GetSystemConfigFromDB(ctx context.Context, key string) (map[string]any, error) {
	var config *entity.SystemConfig
	err := g.DB().Model(&entity.SystemConfig{}).Where(do.SystemConfig{Key: key}).Scan(&config)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, nil
	}

	var configValue map[string]any
	err = json.Unmarshal([]byte(config.Value), &configValue)
	if err != nil {
		return nil, err
	}
	return configValue, nil
}

// SaveSystemConfigToDB writes config directly to database (no cache)
func SaveSystemConfigToDB(ctx context.Context, key string, value map[string]any) error {
	jsonBytes, err := json.Marshal(value)
	if err != nil {
		return err
	}
	jsonString := string(jsonBytes)

	// Check if config exists
	count, err := g.DB().Model(&entity.SystemConfig{}).Where(do.SystemConfig{Key: key}).Count()
	if err != nil {
		return err
	}

	if count == 0 {
		// Insert new config
		_, err = g.DB().Model(&entity.SystemConfig{}).Insert(g.Map{
			"key":   key,
			"value": jsonString,
		})
	} else {
		// Update existing config
		_, err = g.DB().Model(&entity.SystemConfig{}).Where(do.SystemConfig{Key: key}).Update(g.Map{"value": jsonString})
	}
	return err
}
