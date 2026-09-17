package admin

import (
	"context"
	"flai/internal/logic"

	v1 "flai/api/admin/v1"
	"flai/internal/dao"
	"flai/internal/model/do"
)

func (c *ControllerV1) ProviderDelete(ctx context.Context, req *v1.ProviderDeleteReq) (res *v1.ProviderDeleteRes, err error) {
	_, err = dao.Provider.Ctx(ctx).Where(do.Provider{
		Id: req.Id,
	}).Delete()
	if err != nil {
		return nil, err
	}

	if err := logic.UpdateProviderCache(ctx); err != nil {
		return nil, err
	}

	return &v1.ProviderDeleteRes{}, nil
}
