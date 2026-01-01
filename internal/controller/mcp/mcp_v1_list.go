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

func (c *ControllerV1) List(ctx context.Context, req *v1.ListReq) (res *v1.ListRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "Unauthorized")
	}

	var mcpConfigs []*entity.Mcp
	err = dao.Mcp.Ctx(ctx).
		Where(do.Mcp{UserId: user.Id}).
		WhereNull("deleted_at").
		OrderDesc("created_at").
		Scan(&mcpConfigs)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeDbOperationError, err, "Failed to list MCP configurations")
	}

	res = &v1.ListRes{}
	for _, config := range mcpConfigs {
		item := v1.MCPListResponse{
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
				item.Headers = headers
			}
		}

		// Parse tools JSON
		if config.Tools != "" {
			var tools []any
			if json.Unmarshal([]byte(config.Tools), &tools) == nil {
				item.Tools = tools
			}
		}

		*res = append(*res, item)
	}

	return res, nil
}
