package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flai/internal/consts"
	"flai/internal/logic"
	"fmt"
	"io"
	"net/http"
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
		if err := sendBarkAlert(alertCtx, barkURL, body); err != nil {
			g.Log().Warning(alertCtx, "Failed to send Bark LLM error alert:", err)
		}
	}()
}

func sendBarkAlert(ctx context.Context, barkURL, body string) error {
	payload, err := json.Marshal(map[string]string{
		"title": "Flai LLM 请求报错",
		"body":  body,
		"group": "Flai",
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, barkURL, bytes.NewReader(payload))
	if err != nil {
		return errors.New("invalid Bark push URL")
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	res, err := client.Do(req)
	if err != nil {
		// The push URL contains the device key; keep it out of logs.
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			return urlErr.Err
		}
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("Bark returned HTTP %d", res.StatusCode)
	}
	var result struct {
		Code int `json:"code"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 64*1024)).Decode(&result); err != nil {
		return fmt.Errorf("invalid Bark response: %w", err)
	}
	if result.Code != http.StatusOK {
		return fmt.Errorf("Bark returned code %d", result.Code)
	}
	return nil
}
