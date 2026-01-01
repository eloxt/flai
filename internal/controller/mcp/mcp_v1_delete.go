package mcp

import (
	"context"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/os/gtime"

	v1 "flai/api/mcp/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"
)

func (c *ControllerV1) Delete(ctx context.Context, req *v1.DeleteReq) (res *v1.DeleteRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "Unauthorized")
	}

	// Check if config exists and belongs to user
	var existingConfig *entity.Mcp
	err = dao.Mcp.Ctx(ctx).
		Where(do.Mcp{Id: req.Id, UserId: user.Id}).
		WhereNull("deleted_at").
		Scan(&existingConfig)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeDbOperationError, err, "Failed to find MCP configuration")
	}
	if existingConfig == nil {
		return nil, gerror.NewCode(gcode.CodeNotFound, "MCP configuration not found")
	}

	// Soft delete
	_, err = dao.Mcp.Ctx(ctx).
		Where(do.Mcp{Id: req.Id, UserId: user.Id}).
		Data(do.Mcp{DeletedAt: gtime.Now()}).
		Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeDbOperationError, err, "Failed to delete MCP configuration")
	}

	return &v1.DeleteRes{}, nil
}
