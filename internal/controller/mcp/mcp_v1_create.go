package mcp

import (
	"context"
	"encoding/json"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/google/uuid"

	v1 "flai/api/mcp/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
)

func (c *ControllerV1) Create(ctx context.Context, req *v1.CreateReq) (res *v1.CreateRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "Unauthorized")
	}

	// Prepare headers JSON
	var headersJSON string
	if req.Headers != nil {
		headersBytes, err := json.Marshal(req.Headers)
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInvalidParameter, err, "Invalid headers format")
		}
		headersJSON = string(headersBytes)
	} else {
		headersJSON = "{}"
	}

	// Convert bool to int
	isActive := 0
	if req.IsActive {
		isActive = 1
	}

	// Generate ID
	id := uuid.New().String()

	// Insert record
	_, err = dao.Mcp.Ctx(ctx).Data(do.Mcp{
		Id:             id,
		UserId:         user.Id,
		Name:           req.Name,
		ConnectionType: req.ConnectionType,
		Endpoint:       req.Endpoint,
		Headers:        headersJSON,
		IsActive:       isActive,
	}).Insert()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeDbOperationError, err, "Failed to create MCP configuration")
	}

	return &v1.CreateRes{Id: id}, nil
}
