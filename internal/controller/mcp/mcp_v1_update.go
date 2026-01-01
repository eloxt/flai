package mcp

import (
	"context"
	"encoding/json"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/os/gtime"

	v1 "flai/api/mcp/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"
)

func (c *ControllerV1) Update(ctx context.Context, req *v1.UpdateReq) (res *v1.UpdateRes, err error) {
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

	// Build update data
	updateData := do.Mcp{
		UpdatedAt: gtime.Now(),
	}

	if req.Name != "" {
		updateData.Name = req.Name
	}
	if req.ConnectionType != "" {
		updateData.ConnectionType = req.ConnectionType
	}
	if req.Endpoint != "" {
		updateData.Endpoint = req.Endpoint
	}
	if req.Headers != nil {
		headersBytes, err := json.Marshal(req.Headers)
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInvalidParameter, err, "Invalid headers format")
		}
		updateData.Headers = string(headersBytes)
	}
	if req.IsActive != nil {
		if *req.IsActive {
			updateData.IsActive = 1
		} else {
			updateData.IsActive = 0
		}
	}

	// Update record
	_, err = dao.Mcp.Ctx(ctx).
		Where(do.Mcp{Id: req.Id, UserId: user.Id}).
		Data(updateData).
		Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeDbOperationError, err, "Failed to update MCP configuration")
	}

	return &v1.UpdateRes{}, nil
}
