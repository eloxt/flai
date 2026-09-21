package user

import (
	"context"
	"flai/internal/consts"
	"flai/internal/logic"
	"flai/internal/middleware"
	"flai/utility"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/user/v1"
)

func (c *ControllerV1) Feedback(ctx context.Context, req *v1.FeedbackReq) (res *v1.FeedbackRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "User not found")
	}
	content := strings.TrimSpace(req.Content)
	if content == "" || utf8.RuneCountInString(content) > 2000 {
		return nil, gerror.NewCode(gcode.CodeInvalidParameter, "Feedback must contain 1 to 2000 characters")
	}
	config, err := logic.GetSystemConfigFromDB(ctx, consts.SystemConfig.ErrorAlert)
	if err != nil {
		return nil, gerror.NewCode(gcode.CodeInternalError, "Unable to load feedback settings")
	}
	barkURL, _ := config["bark_url"].(string)
	if strings.TrimSpace(barkURL) == "" {
		return nil, gerror.NewCode(gcode.CodeInvalidConfiguration, "Feedback is unavailable: administrator has not configured Bark")
	}
	body := fmt.Sprintf("用户：%s (%s)\n\n%s", user.Username, user.Id, content)
	if err := utility.SendBark(ctx, barkURL, "Flai 用户反馈", body); err != nil {
		return nil, gerror.NewCode(gcode.CodeOperationFailed, "Failed to send feedback; please try again later")
	}
	return &v1.FeedbackRes{}, nil
}
