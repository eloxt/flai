package file

import (
	"context"

	"github.com/gogf/gf/v2/errors/gerror"

	v1 "flai/api/file/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/entity"
)

func (c *ControllerV1) UserFileList(ctx context.Context, req *v1.UserFileListReq) (res *v1.UserFileListRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	var storedList []*entity.File
	err = dao.File.Ctx(ctx).
		Where(dao.File.Columns().UserId, user.Id).
		OrderDesc(dao.File.Columns().CreatedAt).
		Scan(&storedList)
	if err != nil {
		return nil, err
	}

	result := v1.UserFileListRes(storedList)
	return &result, nil
}
