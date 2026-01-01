package mcp

import (
	"context"
	"encoding/json"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	v1 "flai/api/mcp/v1"
	"flai/internal/dao"
	mcplogic "flai/internal/logic/mcp"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"
)

func (c *ControllerV1) CallTool(ctx context.Context, req *v1.CallToolReq) (res *v1.CallToolRes, err error) {
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

	// Check if MCP is active
	if config.IsActive != 1 {
		return nil, gerror.NewCode(gcode.CodeInvalidOperation, "MCP server is not active")
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

	// Create MCP client and call tool
	client := mcplogic.NewMCPClient(&mcplogic.MCPClientOption{
		Endpoint: config.Endpoint,
		Headers:  headers,
	})
	defer client.Close()

	result, err := client.CallTool(ctx, &mcplogic.CallToolParams{
		Name:      req.ToolName,
		Arguments: req.Arguments,
	})
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeOperationFailed, err, "Failed to call tool")
	}

	// Build response
	res = &v1.CallToolRes{
		Content: make([]v1.MCPContentItem, 0, len(result.Content)),
		IsError: result.IsError,
	}
	for _, item := range result.Content {
		res.Content = append(res.Content, v1.MCPContentItem{
			Type:     item.Type,
			Text:     item.Text,
			Data:     item.Data,
			MimeType: item.MimeType,
		})
	}

	return res, nil
}
