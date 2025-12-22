package v1

import (
	"flai/internal/logic"

	"github.com/gogf/gf/v2/frame/g"
)

type ListReq struct {
	g.Meta `path:"/provider" method:"get" tag:"Provider" summary:"List Providers"`
}

type ListRes []SimpleProvider

type SimpleProvider struct {
	Id           string              `json:"id"`
	Name         string              `json:"name"`
	ProviderType string              `json:"provider_type"`
	Model        []logic.ModelConfig `json:"model"`
}
