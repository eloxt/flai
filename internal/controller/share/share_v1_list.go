package share

import (
	"context"
	"encoding/json"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/entity"

	"flai/api/share/v1"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) List(ctx context.Context, req *v1.ListReq) (res *v1.ListRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	var shares []entity.Share
	err = dao.Share.Ctx(ctx).Where(dao.Share.Columns().UserId, user.Id).
		Where(dao.Share.Columns().UserId, user.Id).
		WhereNull("deleted_at").
		OrderDesc("created_at").
		Scan(&shares)
	if err != nil {
		return nil, err
	}

	res = &v1.ListRes{}
	for share, _ := range shares {
		var conversation entity.Conversation
		err = json.Unmarshal([]byte(shares[share].Conversation), &conversation)
		if err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to unmarshal conversation")
		}
		*res = append(*res, v1.ShareListResponse{
			Id:                shares[share].Id,
			ConversationTitle: conversation.Icon + " " + conversation.Title,
			CreatedAt:         shares[share].CreatedAt.String(),
			ExpiresAt:         shares[share].ExpiresAt.String(),
		})
	}
	return res, nil
}
