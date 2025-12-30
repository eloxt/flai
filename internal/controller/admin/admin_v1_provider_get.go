package admin

import (
	"context"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) ProviderGet(ctx context.Context, req *v1.ProviderGetReq) (res *v1.ProviderGetRes, err error) {
	var provider *entity.Provider
	err = dao.Provider.Ctx(ctx).Where(do.Provider{
		Id: req.Id,
	}).Scan(&provider)
	if err != nil {
		return nil, err
	}
	if provider == nil {
		return nil, gerror.New("Provider not found")
	}

	// Mask API key for security
	if len(provider.ApiKey) > 8 {
		provider.ApiKey = provider.ApiKey[:4] + "****" + provider.ApiKey[len(provider.ApiKey)-4:]
	} else if len(provider.ApiKey) > 0 {
		provider.ApiKey = "****"
	}

	result := v1.ProviderGetRes(*provider)
	return &result, nil
}
