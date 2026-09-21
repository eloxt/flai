package llm

import (
	"context"
	"errors"
	"flai/internal/consts"
	"flai/internal/logic"
	"flai/utility"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gogf/gf/v2/frame/g"
)

// notifyError sends alerts independently of the request lifetime and never delays the response.
func notifyError(ctx context.Context, operation string, provider *logic.SimpleProviderInfo, model *logic.ModelConfig, requestErr error) {
	if requestErr == nil || errors.Is(requestErr, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
		return
	}

	detail := requestErr.Error()
	if provider.ApiKey != "" {
		for _, secret := range []string{provider.ApiKey, url.QueryEscape(provider.ApiKey), url.PathEscape(provider.ApiKey)} {
			detail = strings.ReplaceAll(detail, secret, "[redacted]")
		}
	}
	if runes := []rune(detail); len(runes) > 1000 {
		detail = string(runes[:1000]) + "…"
	}
	body := fmt.Sprintf("操作：%s\n服务商：%s (%s)\n模型：%s\n错误：%s", operation, provider.Name, provider.ProviderType, model.ID, detail)

	go func() {
		alertCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		config, err := logic.GetSystemConfigFromDB(alertCtx, consts.SystemConfig.ErrorAlert)
		if err != nil {
			g.Log().Warning(alertCtx, "Failed to load LLM error alert settings")
			return
		}
		barkURL, _ := config["bark_url"].(string)
		if strings.TrimSpace(barkURL) == "" {
			return
		}
		if err := utility.SendBark(alertCtx, barkURL, "Flai LLM 请求报错", body); err != nil {
			g.Log().Warning(alertCtx, "Failed to send Bark LLM error alert:", err)
		}
	}()
}
