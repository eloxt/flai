package mcp

import (
	"context"
	"encoding/json"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/os/gtime"

	v1 "flai/api/mcp/v1"
	"flai/internal/dao"
	mcplogic "flai/internal/logic/mcp"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"
)

func (c *ControllerV1) RefreshTools(ctx context.Context, req *v1.RefreshToolsReq) (res *v1.RefreshToolsRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "Unauthorized")
	}

	// Get the MCP configuration
	var config *entity.Mcp
	err = dao.Mcp.Ctx(ctx).
		Where(do.Mcp{Id: req.Id, UserId: user.Id}).
		WhereNull("deleted_at").
		Scan(&config)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeDbOperationError, err, "Failed to find MCP configuration")
	}
	if config == nil {
		return nil, gerror.NewCode(gcode.CodeNotFound, "MCP configuration not found")
	}

	// Parse headers if present
	var headers map[string]string
	if config.Headers != "" {
		var headersAny map[string]any
		if json.Unmarshal([]byte(config.Headers), &headersAny) == nil {
			headers = make(map[string]string)
			for k, v := range headersAny {
				if str, ok := v.(string); ok {
					headers[k] = str
				}
			}
		}
	}

	// Create MCP client and fetch tools
	client := mcplogic.NewMCPClient(&mcplogic.MCPClientOption{
		Endpoint: config.Endpoint,
		Headers:  headers,
	})
	defer client.Close()

	tools, err := client.ListTools(ctx)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeOperationFailed, err, "Failed to refresh tools from MCP server")
	}

	// Convert tools to JSON for storage
	toolsJSON, err := json.Marshal(tools)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to marshal tools")
	}

	// Update the tools in database
	_, err = dao.Mcp.Ctx(ctx).
		Where(do.Mcp{Id: req.Id, UserId: user.Id}).
		Data(do.Mcp{
			Tools:     string(toolsJSON),
			UpdatedAt: gtime.Now(),
		}).
		Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeDbOperationError, err, "Failed to save tools")
	}

	// Build response
	res = &v1.RefreshToolsRes{
		Tools: make([]v1.MCPToolInfo, 0, len(tools)),
	}
	for _, tool := range tools {
		res.Tools = append(res.Tools, v1.MCPToolInfo{
			Name:        tool.Name,
			Description: tool.Description,
			InputSchema: tool.InputSchema,
		})
	}

	return res, nil
}
