package conversation

import (
	"context"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/google/uuid"

	"flai/api/conversation/v1"
)

func (c *ControllerV1) Create(ctx context.Context, req *v1.CreateReq) (res *v1.CreateRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}
	conversation := entity.Conversation{
		Id:     uuid.New().String(),
		UserId: user.Id,
		Title:  "Untitled",
	}
	_, err = dao.Conversation.Ctx(ctx).Data(conversation).Insert()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to create conversation")
	}

	return &v1.CreateRes{
		Id: conversation.Id,
	}, nil
}
