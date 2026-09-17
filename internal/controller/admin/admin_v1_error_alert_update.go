package admin

import (
	"context"
	"net/url"
	"strings"
	"unicode"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/admin/v1"
	"flai/internal/consts"
	"flai/internal/logic"
)

func (c *ControllerV1) ErrorAlertUpdate(ctx context.Context, req *v1.ErrorAlertUpdateReq) (res *v1.ErrorAlertUpdateRes, err error) {
	barkURL := strings.TrimSpace(req.BarkURL)
	if barkURL != "" {
		endpoint, parseErr := url.Parse(barkURL)
		if parseErr != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.Fragment != "" || strings.ContainsFunc(barkURL, unicode.IsSpace) {
			return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Enter a valid HTTP or HTTPS Bark push URL")
		}
	}
	err = logic.SaveSystemConfigToDB(ctx, consts.SystemConfig.ErrorAlert, map[string]any{"bark_url": barkURL})
	if err != nil {
		return nil, err
	}
	return &v1.ErrorAlertUpdateRes{}, nil
}
