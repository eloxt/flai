package message

import (
	"context"
	v1 "flai/api/message/v1"
	"flai/internal/logic/llm"
	"flai/internal/middleware"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) Cancel(ctx context.Context, req *v1.CancelReq) (res *v1.CancelRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.NewCode(gcode.CodeNotAuthorized, "User not found")
	}

	conversation, err := c.validateConversationAccess(ctx, req.ConversationId, user.Id)
	if err != nil {
		return nil, err
	}
	if conversation == nil {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Conversation not found")
	}

	if !llm.CancelGeneration(req.AssistantMessageId) {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Generation not found")
	}

	return nil, nil
}
