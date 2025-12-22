package middleware

import (
	"context"
	"flai/internal/consts"
	"flai/internal/model/entity"
	"flai/utility"
	"net/http"
	"strings"

	"github.com/gogf/gf/v2/net/ghttp"
)

type contextKey string

const (
	UserContextKey contextKey = "user"
)

func RequireAuth(r *ghttp.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{
			Code:    http.StatusUnauthorized,
			Message: "Authorization header required",
		})
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{
			Code:    http.StatusUnauthorized,
			Message: "Invalid authorization header format",
		})
		return
	}

	tokenString := parts[1]

	claims, err := utility.TokenManagerInstance.ValidateToken(tokenString)
	if err != nil {
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{
			Code:    http.StatusUnauthorized,
			Message: "Invalid or expired token",
		})
		return
	}

	user := &entity.User{
		Id:    claims.UserID,
		Email: claims.Email,
		Role:  claims.Role,
	}

	r.SetCtxVar(UserContextKey, user)
	r.Middleware.Next()
}

func RequireAdminAuth(r *ghttp.Request) {
	user, ok := GetUserFromContext(r.Context())
	if !ok || user.Role != consts.UserRole.Admin {
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{
			Code:    http.StatusForbidden,
			Message: "Admin access required",
		})
		return
	}
	r.Middleware.Next()
}

func GetUserFromContext(ctx context.Context) (*entity.User, bool) {
	user, ok := ctx.Value(UserContextKey).(*entity.User)
	return user, ok
}
