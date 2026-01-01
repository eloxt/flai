package mcp

import (
	"context"
	"encoding/json"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	v1 "flai/api/mcp/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"
)

func (c *ControllerV1) Get(ctx context.Context, req *v1.GetReq) (res *v1.GetRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "Unauthorized")
	}

	var config *entity.Mcp
	err = dao.Mcp.Ctx(ctx).
		Where(do.Mcp{Id: req.Id, UserId: user.Id}).
		WhereNull("deleted_at").
		Scan(&config)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeDbOperationError, err, "Failed to get MCP configuration")
	}

	if config == nil {
		return nil, gerror.NewCode(gcode.CodeNotFound, "MCP configuration not found")
	}

	res = &v1.GetRes{
		Id:             config.Id,
		Name:           config.Name,
		ConnectionType: config.ConnectionType,
		Endpoint:       config.Endpoint,
		IsActive:       config.IsActive == 1,
		CreatedAt:      config.CreatedAt.String(),
		UpdatedAt:      config.UpdatedAt.String(),
	}

	// Parse headers JSON
	if config.Headers != "" {
		var headers map[string]any
		if json.Unmarshal([]byte(config.Headers), &headers) == nil {
			res.Headers = headers
		}
	}

	// Parse tools JSON
	if config.Tools != "" {
		var tools []any
		if json.Unmarshal([]byte(config.Tools), &tools) == nil {
			res.Tools = tools
		}
	}

	return res, nil
}
