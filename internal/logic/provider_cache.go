package logic

import (
	"context"
	"encoding/json"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/frame/g"
)

// ProviderMap provider id -> model id -> model
var ProviderMap map[string]*SimpleProviderInfo

type ModelConfig struct {
	ID               string     `json:"id"`
	Name             string     `json:"name"`
	Attachment       bool       `json:"attachment"`
	Reasoning        bool       `json:"reasoning"`
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
	BaseUrl      string
	ApiKey       string
	ModelIdMap   map[string]*ModelConfig
}

func UpdateProviderCache(ctx context.Context) {
	var providerList []*entity.Provider
	err := g.DB().Model(&entity.Provider{}).Where(do.Provider{IsActive: 1}).Scan(&providerList)
	if err != nil {
		g.Log().Fatal(ctx, err)
	}

	ProviderMap = make(map[string]*SimpleProviderInfo)
	for _, provider := range providerList {
		model := provider.Model
		if model == "" {
			continue
		}
		if _, ok := ProviderMap[provider.Id]; !ok {
			modelInfo := SimpleProviderInfo{
				ProviderType: provider.ProviderType,
				ApiKey:       provider.ApiKey,
				BaseUrl:      provider.BaseUrl,
				ModelIdMap:   make(map[string]*ModelConfig),
			}
			ProviderMap[provider.Id] = &modelInfo
		}
		var modelConfigList []*ModelConfig
		err := json.Unmarshal([]byte(model), &modelConfigList)
		if err != nil {
			g.Log().Fatalf(ctx, "Provider model config unmarshal err: %v", err)
		}
		for _, modelConfig := range modelConfigList {
			ProviderMap[provider.Id].ModelIdMap[modelConfig.ID] = modelConfig
		}
	}
	g.Log().Infof(ctx, "Provider cache updated")
}
