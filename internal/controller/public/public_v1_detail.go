package public

import (
	"context"
	"encoding/json"
	v2 "flai/api/conversation/v1"
	"flai/internal/dao"
	"flai/internal/logic/llm"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/public/v1"
)

func (c *ControllerV1) Detail(ctx context.Context, req *v1.DetailReq) (res *v1.DetailRes, err error) {
	var share entity.Share
	err = dao.Share.Ctx(ctx).Where(do.Share{
		Id: req.Id,
	}).Scan(&share)
	if err != nil {
		return nil, err
	}

	var conversation entity.Conversation
	err = json.Unmarshal([]byte(share.Conversation), &conversation)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to unmarshal conversation")
	}

	var message []*entity.Message
	err = json.Unmarshal([]byte(share.Message), &message)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to unmarshal message")
	}
	var messageResult []*v2.MessageResponse
	for _, msg := range message {
		var content []llm.Content
		err := json.Unmarshal([]byte(msg.Content), &content)
		if err != nil {
			return nil, err
		}
		var metaInfo llm.MessageMetaInfo
		err = json.Unmarshal([]byte(msg.MetaInfo), &metaInfo)
		if err != nil {
			return nil, err
		}
		messageResult = append(messageResult, &v2.MessageResponse{
			ID:        msg.Id,
			ParentID:  msg.ParentId,
			Role:      msg.Role,
			Content:   content,
			MetaInfo:  metaInfo,
			CreatedAt: msg.CreatedAt,
		})
	}
	res = &v1.DetailRes{
		Id:           share.Id,
		UserId:       share.UserId,
		Conversation: conversation,
		Message:      messageResult,
		CreatedAt:    share.CreatedAt.String(),
		ExpiresAt:    share.ExpiresAt.String(),
	}
	return
}
