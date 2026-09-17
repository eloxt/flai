package logic

import (
	"context"
	"encoding/json"
	"flai/internal/model/do"
	"flai/internal/model/entity"
	"sync"

	"github.com/gogf/gf/v2/frame/g"
)

var systemConfigMu sync.RWMutex
var systemConfigMap = make(map[string]map[string]any)

// Returned values are immutable snapshots; callers must not modify them.
func GetSystemConfig(key string) map[string]any {
	systemConfigMu.RLock()
	defer systemConfigMu.RUnlock()
	return systemConfigMap[key]
}

func UpdateSystemConfigCache(ctx context.Context) error {
	systemConfigMu.Lock()
	defer systemConfigMu.Unlock()
	var configs []*entity.SystemConfig
	if err := g.DB().Model(&entity.SystemConfig{}).Ctx(ctx).Scan(&configs); err != nil {
		return err
	}
	snapshot := make(map[string]map[string]any, len(configs))
	for _, config := range configs {
		var value map[string]any
		if err := json.Unmarshal([]byte(config.Value), &value); err != nil {
			return err
		}
		snapshot[config.Key] = value
	}
	systemConfigMap = snapshot
	return nil
}

// GetSystemConfigFromDB reads config directly from database (no cache)
func GetSystemConfigFromDB(ctx context.Context, key string) (map[string]any, error) {
	var config *entity.SystemConfig
	err := g.DB().Model(&entity.SystemConfig{}).Ctx(ctx).Where(do.SystemConfig{Key: key}).Scan(&config)
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

// SaveSystemConfigToDB publishes the saved value before returning. Serialize writes
// with full reloads so an older snapshot cannot overwrite a successful save.
func SaveSystemConfigToDB(ctx context.Context, key string, value map[string]any) error {
	jsonBytes, err := json.Marshal(value)
	if err != nil {
		return err
	}
	var snapshot map[string]any
	if err := json.Unmarshal(jsonBytes, &snapshot); err != nil {
		return err
	}
	systemConfigMu.Lock()
	defer systemConfigMu.Unlock()
	_, err = g.DB().Exec(ctx, `INSERT INTO system_config (key, value) VALUES ($1, $2::jsonb)
 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, string(jsonBytes))
	if err != nil {
		return err
	}
	systemConfigMap[key] = snapshot
	return nil
}
