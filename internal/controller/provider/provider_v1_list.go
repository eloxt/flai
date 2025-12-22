package provider

import (
	"context"
	"encoding/json"
	"flai/internal/dao"
	"flai/internal/logic"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/provider/v1"
)

func (c *ControllerV1) List(ctx context.Context, req *v1.ListReq) (res *v1.ListRes, err error) {
	var providers []*entity.Provider
	err = dao.Provider.Ctx(ctx).
		Where(do.Provider{IsActive: 1}).
		WhereNull("deleted_at").
		OrderDesc("name").
		Scan(&providers)
	if err != nil {
		return nil, err
	}

	res = &v1.ListRes{}
	for _, provider := range providers {
		modelConfigString := provider.Model
		var modelConfigList []logic.ModelConfig
		err := json.Unmarshal([]byte(modelConfigString), &modelConfigList)
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to unmarshal model config")
		}
		*res = append(*res, v1.SimpleProvider{
			Id:           provider.Id,
			Name:         provider.Name,
			ProviderType: provider.ProviderType,
			Model:        modelConfigList,
		})
	}
	return res, nil
}
