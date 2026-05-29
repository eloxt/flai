package translate

import (
	"context"
	v1 "flai/api/translate/v1"
	"flai/internal/consts"
	"flai/internal/logic"
	"flai/internal/logic/llm"
	"flai/internal/middleware"
	"strings"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
)

func (c *ControllerV1) Translate(ctx context.Context, req *v1.TranslateReq) (res *v1.TranslateRes, err error) {
	if _, ok := middleware.GetUserFromContext(ctx); !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "User not found")
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Text cannot be empty")
	}

	sourceLanguage := strings.TrimSpace(req.SourceLanguage)
	if sourceLanguage == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Source language cannot be empty")
	}

	targetLanguage := strings.TrimSpace(req.TargetLanguage)
	if targetLanguage == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Target language cannot be empty")
	}

	providerInfo := logic.ProviderMap[req.ProviderId]
	if providerInfo == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid provider ID")
	}

	modelConfig := providerInfo.ModelIdMap[req.ModelName]
	if modelConfig == nil {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Invalid model name")
	}

	prompt, err := c.buildTranslatePrompt(sourceLanguage, targetLanguage, text)
	if err != nil {
		return nil, err
	}

	response, err := c.setupSSEResponse(ctx)
	if err != nil {
		return nil, err
	}

	if err := llm.StreamTranslate(ctx, response, providerInfo, modelConfig, prompt); err != nil {
		return nil, err
	}

	return nil, nil
}

func (c *ControllerV1) buildTranslatePrompt(sourceLanguage, targetLanguage, text string) (string, error) {
	systemPromptObject, ok := logic.SystemConfigMap[consts.SystemConfig.SystemPrompt]
	if !ok {
		return "", gerror.NewCode(gcode.CodeInternalError, "System prompt config not found")
	}

	template, ok := systemPromptObject["translate"].(string)
	if !ok || strings.TrimSpace(template) == "" {
		return "", gerror.NewCode(gcode.CodeInternalError, "Translate prompt template not found")
	}

	prompt := strings.ReplaceAll(template, "{{sourceLanguage}}", strings.TrimSpace(sourceLanguage))
	prompt = strings.ReplaceAll(prompt, "{{targetLanguage}}", strings.TrimSpace(targetLanguage))
	prompt = strings.ReplaceAll(prompt, "{{text}}", text)

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
