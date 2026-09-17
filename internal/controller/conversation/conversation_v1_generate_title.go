package conversation

import (
	"context"
	"flai/internal/dao"
	"flai/internal/logic/llm"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"
	"time"

	v1 "flai/api/conversation/v1"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) GenerateTitle(ctx context.Context, req *v1.GenerateTitleReq) (res *v1.GenerateTitleRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}
	var conversation entity.Conversation
	err = dao.Conversation.Ctx(ctx).Where(do.Conversation{
		Id:     req.Id,
		UserId: user.Id,
	}).
		WhereNull("deleted_at").
		Scan(&conversation)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch conversation")
	}
	if conversation.Id == "" {
		return nil, gerror.NewCode(gcode.CodeNotFound, "Conversation not found")
	}

	var messages []*entity.Message
	if req.Content == "" {
		err = dao.Message.Ctx(ctx).
			Where(do.Message{ConversationId: conversation.Id}).
			OrderAsc("created_at").
			Limit(1).
			Scan(&messages)
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch messages")
		}
	}

	type titleResult struct {
		res *v1.GenerateTitleRes
		err error
	}

	generationCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Minute)
	done := make(chan titleResult, 1)

	go func() {
		defer cancel()
		defer func() {
			if recovered := recover(); recovered != nil {
				done <- titleResult{err: gerror.New("Title generation failed")}
			}
		}()

		title, err := llm.GenerateTitle(generationCtx, messages, req.Content)
		if err != nil {
			done <- titleResult{err: err}
			return
		}

		if title == nil {
			done <- titleResult{err: gerror.New("Empty title result")}
			return
		}
		_, err = dao.Conversation.Ctx(generationCtx).
			Data(do.Conversation{Title: title.Title, Icon: title.Icon}).
			Where(do.Conversation{Id: conversation.Id, UserId: user.Id}).
			Update()
		if err != nil {
			done <- titleResult{err: gerror.WrapCode(gcode.CodeInternalError, err, "Failed to update conversation")}
			return
		}

		done <- titleResult{res: &v1.GenerateTitleRes{
			Title: title.Title,
			Icon:  title.Icon,
		}}
	}()

	select {
	case result := <-done:
		if result.err != nil {
			return nil, result.err
		}
		return result.res, nil
	case <-ctx.Done():
		return nil, nil
	}
}
