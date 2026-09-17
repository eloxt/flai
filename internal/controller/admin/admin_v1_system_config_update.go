package admin

import (
	"context"
	"flai/internal/consts"
	"flai/internal/logic"
	"strings"
	"unicode/utf8"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/admin/v1"
)

func (c *ControllerV1) SystemConfigUpdate(ctx context.Context, req *v1.SystemConfigUpdateReq) (res *v1.SystemConfigUpdateRes, err error) {
	fields := []string{"prompt", "translate"}
	switch req.Key {
	case consts.SystemConfig.TitleGeneration:
		fields = []string{"provider_id", "model_name", "prompt"}
	case consts.SystemConfig.SystemPrompt:
	default:
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Unsupported system configuration")
	}
	for _, field := range fields {
		value, ok := req.Value[field].(string)
		if !ok || utf8.RuneCountInString(value) > 100000 {
			return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid configuration field: "+field)
		}
		if (req.Key == consts.SystemConfig.TitleGeneration || field == "translate") && strings.TrimSpace(value) == "" {
			return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Configuration field is required: "+field)
		}
	}
	if req.Key == consts.SystemConfig.TitleGeneration {
		provider := logic.GetProvider(req.Value["provider_id"].(string))
		if provider == nil || provider.ModelIdMap[req.Value["model_name"].(string)] == nil {
			return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Select an active provider and an available model")
		}
	}
	// Preserve fields used by older/newer deployments that this form does not edit.
	value, err := logic.GetSystemConfigFromDB(ctx, req.Key)
	if err != nil {
		return nil, err
	}
	if value == nil {
		value = map[string]any{}
	}
	for _, field := range fields {
		value[field] = req.Value[field]
	}
	if err := logic.SaveSystemConfigToDB(ctx, req.Key, value); err != nil {
		return nil, err
	}
	return &v1.SystemConfigUpdateRes{}, nil
}
