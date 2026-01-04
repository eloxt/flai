package conversation

import (
	"context"
	"encoding/json"
	"flai/internal/dao"
	"flai/internal/middleware"

	"flai/api/conversation/v1"

	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) Search(ctx context.Context, req *v1.SearchReq) (res *v1.SearchRes, err error) {
	if req.Query == "" {
		return nil, gerror.New("Query cannot be empty")
	}

	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	var queryResult []dao.ConversationSearch
	err = dao.Conversation.Ctx(ctx).Raw("SELECT ts_headline('zhcfg', \"content\", to_tsquery('zhcfg', ?), 'StartSel=<em>, StopSel=</em>, MaxWords=50, MinWords=10') as highlight, conversation_id, title, icon, conversation.created_at FROM message LEFT JOIN conversation ON message.conversation_id = conversation.id WHERE tsv_content @@ to_tsquery('zhcfg', ?) AND conversation.user_id = ? AND conversation.deleted_at IS NULL AND message.deleted_at IS NULL", req.Query, req.Query, user.Id).Scan(&queryResult)
	if err != nil {
		return nil, err
	}

	var result v1.SearchRes = make([]v1.SearchResponse, 0)
	for _, item := range queryResult {
		var marshal []map[string]any
		err := json.Unmarshal([]byte(item.Highlight), &marshal)
		if err != nil {
			return nil, err
		}
		for _, v := range marshal {
			if v["type"] == "message" {
				result = append(result, v1.SearchResponse{
					Highlight:      v["data"].(map[string]any)["content"].(string),
					ConversationId: item.ConversationId,
					Title:          item.Title,
					Icon:           item.Icon,
					CreatedAt:      item.CreatedAt,
				})
			}
		}
	}
	return &result, nil
}
