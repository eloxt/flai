package v1

import "github.com/gogf/gf/v2/frame/g"

type TranslateReq struct {
	g.Meta         `path:"/translate" method:"post" tag:"Translate" summary:"Translate text"`
	ProviderId     string `json:"provider_id" v:"required"`
	ModelName      string `json:"model_name" v:"required"`
	SourceLanguage string `json:"source_language" v:"required"`
	TargetLanguage string `json:"target_language" v:"required"`
	Text           string `json:"text" v:"required"`
}

type TranslateRes struct{}
