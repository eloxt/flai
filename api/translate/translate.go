// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package translate

import (
	"context"

	"flai/api/translate/v1"
)

type ITranslateV1 interface {
	Translate(ctx context.Context, req *v1.TranslateReq) (res *v1.TranslateRes, err error)
}
