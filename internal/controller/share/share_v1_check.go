package share

import (
	"context"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/share/v1"
)

func (c *ControllerV1) Check(ctx context.Context, req *v1.CheckReq) (res *v1.CheckRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}
	var share *entity.Share
	err = dao.Share.Ctx(ctx).Where(
		"conversation->>'id' = ?",
		req.Id).Where("user_id", user.Id).
		Scan(&share)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to check share")
	}
	if share == nil {
		return &v1.CheckRes{
			Exists: false,
		}, nil
	}

	return &v1.CheckRes{
		Exists: true,
		Id:     share.Id,
	}, nil
}
