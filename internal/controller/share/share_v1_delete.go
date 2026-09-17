package share

import (
	"context"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/share/v1"
)

func (c *ControllerV1) Delete(ctx context.Context, req *v1.DeleteReq) (res *v1.DeleteRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}
	_, err = dao.Share.Ctx(ctx).Delete(do.Share{
		Id:     req.Id,
		UserId: user.Id,
	})
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to delete share")
	}
	return &v1.DeleteRes{}, nil
}
