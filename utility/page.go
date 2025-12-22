package utility

type PageReq struct {
	Size    int `json:"size"`
	Current int `json:"current"`
}

type PageRes[T any] struct {
	Total   int  `json:"total"`
	Current int  `json:"current"`
	Size    int  `json:"size"`
	Records []*T `json:"records"`
}
