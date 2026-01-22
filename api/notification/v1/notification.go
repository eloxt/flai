package v1

import "github.com/gogf/gf/v2/frame/g"

type ListReq struct {
	g.Meta `path:"/notification" method:"get" tag:"Notification" summary:"List notifications"`
}

type ListRes struct {
	List []NotificationItem `json:"list"`
}

type NotificationItem struct {
	Id      string `json:"id" dc:"Notification ID"`
	Title   string `json:"title" dc:"Notification title"`
	Content string `json:"content" dc:"Notification content"`
	Level   string `json:"level" dc:"Notification level (default/warning)"`
}
