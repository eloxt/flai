package translate

import (
	"context"
	v1 "flai/api/translate/v1"
	"flai/internal/consts"
	"flai/internal/dao"
	"flai/internal/logic"
	"flai/internal/logic/llm"
	"flai/internal/middleware"
	"flai/internal/model/entity"
	"strings"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
)

func (c *ControllerV1) Translate(ctx context.Context, req *v1.TranslateReq) (res *v1.TranslateRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "User not found")
	}

	text := strings.TrimSpace(req.Text)
	if text == "" && len(req.ImageIds) == 0 {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Text or image is required")
	}

	if len(req.ImageIds) > 5 {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Maximum 5 images allowed")
	}

	sourceLanguage := strings.TrimSpace(req.SourceLanguage)
	if sourceLanguage == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Source language cannot be empty")
	}

	targetLanguage := strings.TrimSpace(req.TargetLanguage)
	if targetLanguage == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Target language cannot be empty")
	}

	customInstruction := strings.TrimSpace(req.CustomInstruction)
	if len(customInstruction) > 500 {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Custom instruction must not exceed 500 characters")
	}

	providerInfo := logic.ProviderMap[req.ProviderId]
	if providerInfo == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid provider ID")
	}

	modelConfig := providerInfo.ModelIdMap[req.ModelName]
	if modelConfig == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid model name")
	}

	var images []*entity.File
	if len(req.ImageIds) > 0 {
		imageIds := make([]string, 0, len(req.ImageIds))
		seen := make(map[string]struct{}, len(req.ImageIds))
		for _, id := range req.ImageIds {
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			imageIds = append(imageIds, id)
		}

		var files []*entity.File
		err := dao.File.Ctx(ctx).
			WhereIn(dao.File.Columns().Id, imageIds).
			Where(dao.File.Columns().UserId, user.Id).
			Scan(&files)
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch files")
		}
		if len(files) != len(imageIds) {
			return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid image ID")
		}
		for _, f := range files {
			if !strings.HasPrefix(f.MimeType, "image/") {
				return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Only image files are supported")
			}
		}
		images = files
	}

	prompt, err := c.buildTranslatePrompt(sourceLanguage, targetLanguage, text, customInstruction)
	if err != nil {
		return nil, err
	}

	response, err := c.setupSSEResponse(ctx)
	if err != nil {
		return nil, err
	}

	if err := llm.StreamTranslate(ctx, response, providerInfo, modelConfig, prompt, images); err != nil {
		return nil, err
	}

	return nil, nil
}

func (c *ControllerV1) buildTranslatePrompt(sourceLanguage, targetLanguage, text, customInstruction string) (string, error) {
	systemPromptObject, ok := logic.SystemConfigMap[consts.SystemConfig.SystemPrompt]
	if !ok {
		return "", gerror.NewCode(gcode.CodeInternalError, "System prompt config not found")
	}

	template, ok := systemPromptObject["translate"].(string)
	if !ok || strings.TrimSpace(template) == "" {
		return "", gerror.NewCode(gcode.CodeInternalError, "Translate prompt template not found")
	}

	textContent := text
	if textContent == "" {
		textContent = "Translate the text content of the attached image(s)."
	}

	prompt := strings.ReplaceAll(template, "{{sourceLanguage}}", strings.TrimSpace(sourceLanguage))
	prompt = strings.ReplaceAll(prompt, "{{targetLanguage}}", strings.TrimSpace(targetLanguage))
	prompt = strings.ReplaceAll(prompt, "{{text}}", textContent)

	if customInstruction != "" {
		prompt += "\n\nAdditional style requirements from the user: " + customInstruction
	}

	return prompt, nil
}

func (c *ControllerV1) setupSSEResponse(ctx context.Context) (*ghttp.Response, error) {
	request := g.RequestFromCtx(ctx)
	if request == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid request")
	}

	response := request.Response
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Connection", "keep-alive")
	response.Header().Set("Access-Control-Allow-Origin", "*")

	return response, nil
}
