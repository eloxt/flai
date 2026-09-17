package middleware

import (
	"context"
	"flai/internal/consts"
	"flai/internal/dao"
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
		r.Response.WriteHeader(http.StatusUnauthorized)
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{
			Code:    http.StatusUnauthorized,
			Message: "Authorization header required",
		})
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		r.Response.WriteHeader(http.StatusUnauthorized)
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{
			Code:    http.StatusUnauthorized,
			Message: "Invalid authorization header format",
		})
		return
	}

	tokenString := parts[1]

	claims, err := utility.TokenManagerInstance.ValidateToken(tokenString)
	if err != nil {
		r.Response.WriteHeader(http.StatusUnauthorized)
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{
			Code:    http.StatusUnauthorized,
			Message: "Invalid or expired token",
		})
		return
	}

	var user *entity.User
	err = dao.User.Ctx(r.Context()).Where("id", claims.UserID).Scan(&user)
	if err != nil {
		r.Response.WriteHeader(http.StatusServiceUnavailable)
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{Code: http.StatusServiceUnavailable, Message: "Unable to verify account"})
		return
	}
	if !utility.TokenManagerInstance.MatchesUser(claims, user) {
		r.Response.WriteHeader(http.StatusUnauthorized)
		r.Response.WriteJson(ghttp.DefaultHandlerResponse{Code: http.StatusUnauthorized, Message: "Account unavailable or session revoked"})
		return
	}

	user.Password = ""
	r.SetCtxVar(UserContextKey, user)
	r.Middleware.Next()
}

func RequireAdminAuth(r *ghttp.Request) {
	user, ok := GetUserFromContext(r.Context())
	if !ok || user.Role != consts.UserRole.Admin {
		r.Response.WriteHeader(http.StatusForbidden)
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
