package admin

import (
	"context"
	"encoding/json"
	"flai/internal/logic"
	"github.com/gogf/gf/v2/errors/gerror"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/do"
)

func (c *ControllerV1) ProviderUpdate(ctx context.Context, req *v1.ProviderUpdateReq) (res *v1.ProviderUpdateRes, err error) {
	updateData := do.Provider{}

	if req.Name != "" {
		updateData.Name = req.Name
	}
	if req.APIKey != "" {
		updateData.ApiKey = req.APIKey
	}
	if req.ProviderType != "" {
		updateData.ProviderType = req.ProviderType
	}
	if req.BaseURL != "" {
		updateData.BaseUrl = req.BaseURL
	}
	if req.Models != nil {
		modelsBytes, err := json.Marshal(req.Models)
		if err != nil {
			return nil, err
		}
		var models []*logic.ModelConfig
		if err := json.Unmarshal(modelsBytes, &models); err != nil {
			return nil, gerror.New("Invalid provider models")
		}
		for _, model := range models {
			if model == nil || model.ID == "" {
				return nil, gerror.New("Provider models must have an ID")
			}
		}

		updateData.Model = string(modelsBytes)
	}
	if req.IsActive != nil {
		isActive := 0
		if *req.IsActive {
			isActive = 1
		}
		updateData.IsActive = isActive
	}
	if req.Logo != "" {
		updateData.Logo = req.Logo
	}

	_, err = dao.Provider.Ctx(ctx).Where(do.Provider{
		Id: req.Id,
	}).Data(updateData).Update()
	if err != nil {
		return nil, err
	}

	if err := logic.UpdateProviderCache(ctx); err != nil {
		return nil, err
	}
	return &v1.ProviderUpdateRes{}, nil
}
