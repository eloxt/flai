package admin

import (
	"context"
	"encoding/json"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/entity"
)

func (c *ControllerV1) ProviderList(ctx context.Context, req *v1.ProviderListReq) (res *v1.ProviderListRes, err error) {
	var providers []*entity.Provider
	err = dao.Provider.Ctx(ctx).Scan(&providers)
	if err != nil {
		return nil, err
	}

	// Mask API keys for security
	for _, p := range providers {
		if len(p.ApiKey) > 8 {
			p.ApiKey = p.ApiKey[:4] + "****" + p.ApiKey[len(p.ApiKey)-4:]
		} else if len(p.ApiKey) > 0 {
			p.ApiKey = "****"
		}
	}

	// Serialize model json
	var result v1.ProviderListRes
	for _, p := range providers {
		var model []map[string]any
		err := json.Unmarshal([]byte(p.Model), &model)
		if err != nil {
			return nil, err
		}
		result = append(result, v1.ProviderResponse{
			Id:           p.Id,
			Name:         p.Name,
			ApiKey:       p.ApiKey,
			ProviderType: p.ProviderType,
			BaseUrl:      p.BaseUrl,
			Model:        model,
			IsActive:     p.IsActive,
			CreatedAt:    p.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:    p.UpdatedAt.Format("2006-01-02 15:04:05"),
			DeletedAt:    p.DeletedAt.Format("2006-01-02 15:04:05"),
			Logo:         p.Logo,
		})
	}
	return &result, nil
}
