package admin

import (
	"context"
	"encoding/json"
	"flai/internal/logic"

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

	logic.UpdateProviderCache(ctx)
	return &v1.ProviderUpdateRes{}, nil
}
