package logic

import (
	"context"
	"encoding/json"
	"flai/internal/model/do"
	"flai/internal/model/entity"
	"fmt"
	"sync"

	"github.com/gogf/gf/v2/frame/g"
)

var providerMu sync.RWMutex
var providerMap map[string]*SimpleProviderInfo

// Published snapshots and their nested model maps are immutable.
func GetProvider(id string) *SimpleProviderInfo {
	providerMu.RLock()
	defer providerMu.RUnlock()
	return providerMap[id]
}

type ModelConfig struct {
	ID               string     `json:"id"`
	Name             string     `json:"name"`
	Badge            string     `json:"badge"`
	Attachment       bool       `json:"attachment"`
	Reasoning        bool       `json:"reasoning"`
	ThinkingLevels   []string   `json:"thinking_levels"`
	ToolCall         bool       `json:"tool_call"`
	StructuredOutput bool       `json:"structured_output"`
	Temperature      bool       `json:"temperature"`
	Knowledge        string     `json:"knowledge"`
	ReleaseDate      string     `json:"release_date"`
	LastUpdated      string     `json:"last_updated"`
	Modalities       Modalities `json:"modalities"`
	OpenWeights      bool       `json:"open_weights"`
	Cost             Cost       `json:"cost"`
	Limit            Limit      `json:"limit"`
	InternalTools    []string   `json:"internal_tools"`
}

type Cost struct {
	Input           float64 `json:"input"`
	Output          float64 `json:"output"`
	CacheRead       float64 `json:"cache_read"`
	CacheWrite      float64 `json:"cache_write"`
	ContextOver200K *Cost   `json:"context_over_200k,omitempty"`
}

type Limit struct {
	Context int64 `json:"context"`
	Output  int64 `json:"output"`
}

type Modalities struct {
	Input  []string `json:"input"`
	Output []string `json:"output"`
}

type SimpleProviderInfo struct {
	ProviderType string
	Name         string
	BaseUrl      string
	ApiKey       string
	ModelIdMap   map[string]*ModelConfig
}

func UpdateProviderCache(ctx context.Context) error {
	providerMu.Lock()
	defer providerMu.Unlock()
	// A failed reload must not leave deleted credentials usable.
	providerMap = nil
	var providers []*entity.Provider
	if err := g.DB().Model(&entity.Provider{}).Ctx(ctx).Where(do.Provider{IsActive: 1}).Scan(&providers); err != nil {
		return err
	}
	snapshot := make(map[string]*SimpleProviderInfo, len(providers))
	for _, provider := range providers {
		info := &SimpleProviderInfo{ProviderType: provider.ProviderType, Name: provider.Name, ApiKey: provider.ApiKey, BaseUrl: provider.BaseUrl, ModelIdMap: make(map[string]*ModelConfig)}
		if provider.Model != "" {
			var models []*ModelConfig
			if err := json.Unmarshal([]byte(provider.Model), &models); err != nil {
				return fmt.Errorf("invalid provider model configuration: %w", err)
			}
			for _, model := range models {
				if model == nil || model.ID == "" {
					return fmt.Errorf("invalid provider model")
				}
				info.ModelIdMap[model.ID] = model
			}
		}
		snapshot[provider.Id] = info
	}
	providerMap = snapshot
	return nil
}
