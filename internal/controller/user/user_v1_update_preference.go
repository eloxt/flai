package user

import (
	"context"
	"encoding/json"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/do"
	"flai/internal/model/entity"

	"github.com/gogf/gf/v2/errors/gcode"
	"github.com/gogf/gf/v2/errors/gerror"

	"flai/api/user/v1"
)

func (c *ControllerV1) UpdatePreference(ctx context.Context, req *v1.UpdatePreferenceReq) (res *v1.UpdatePreferenceRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	var dbUser *entity.User
	err = dao.User.Ctx(ctx).Fields("preference").Where(do.User{
		Id: user.Id,
	}).Scan(&dbUser)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to fetch user preference")
	}

	preference := make(map[string]any)
	if dbUser != nil && dbUser.Preference != "" {
		if err = json.Unmarshal([]byte(dbUser.Preference), &preference); err != nil {
			return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to parse user preference")
		}
	}

	for key, value := range req.Preference {
		preference[key] = value
	}

	preferenceBytes, err := json.Marshal(preference)
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to encode user preference")
	}

	_, err = dao.User.Ctx(ctx).Data(do.User{
		Preference: string(preferenceBytes),
	}).Where(do.User{
		Id: user.Id,
	}).Update()
	if err != nil {
		return nil, gerror.WrapCode(gcode.CodeInternalError, err, "Failed to update user preference")
	}

	return &v1.UpdatePreferenceRes{
		Preference: preference,
	}, nil
}
