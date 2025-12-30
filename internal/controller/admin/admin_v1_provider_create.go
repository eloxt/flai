package admin

import (
	"context"
	"encoding/json"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/entity"

	"github.com/google/uuid"
)

func (c *ControllerV1) ProviderCreate(ctx context.Context, req *v1.ProviderCreateReq) (res *v1.ProviderCreateRes, err error) {
	isActive := 0
	if req.IsActive {
		isActive = 1
	}

	// Convert models array to JSON string
	modelsJson := ""
	if req.Models != nil {
		modelsBytes, err := json.Marshal(req.Models)
		if err != nil {
			return nil, err
		}
		modelsJson = string(modelsBytes)
	}

	newProvider := &entity.Provider{
		Id:           uuid.New().String(),
		Name:         req.Name,
		ApiKey:       req.APIKey,
		ProviderType: req.ProviderType,
		BaseUrl:      req.BaseURL,
		Model:        modelsJson,
		IsActive:     int64(isActive),
		Logo:         req.Logo,
	}

	_, err = dao.Provider.Ctx(ctx).Insert(newProvider)
	if err != nil {
		return nil, err
	}

	result := v1.ProviderCreateRes(*newProvider)
	return &result, nil
}
