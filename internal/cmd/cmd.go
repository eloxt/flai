package cmd

import (
	"context"
	"flai/internal/controller/admin"
	"flai/internal/controller/auth"
	"flai/internal/controller/conversation"
	"flai/internal/controller/message"
	"flai/internal/controller/provider"
	"flai/internal/controller/user"
	"flai/internal/logic"
	"flai/internal/middleware"
	"flai/utility"
	"net/http"
	"strings"

	_ "github.com/gogf/gf/contrib/drivers/pgsql/v2"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/os/gcmd"
)

var (
	Main = gcmd.Command{
		Name:  "main",
		Usage: "main",
		Brief: "start http server",
		Func: func(ctx context.Context, parser *gcmd.Parser) error {
			utility.InitTokenManager(ctx)
			logic.UpdateProviderCache(ctx)
			logic.UpdateSystemConfigCache(ctx)

			s := g.Server()
			RegisterRouter(s)
			s.Run()
			return nil
		},
	}
)

func RegisterRouter(s *ghttp.Server) {
	s.Group("/api", func(group *ghttp.RouterGroup) {
		group.Middleware(middleware.RequireAuth)
		group.Middleware(ghttp.MiddlewareHandlerResponse)
		group.Bind(
			conversation.NewV1(),
			message.NewV1(),
			provider.NewV1(),
			user.NewV1(),
		)
	})
	s.Group("/auth", func(group *ghttp.RouterGroup) {
		group.Middleware(ghttp.MiddlewareHandlerResponse)
		group.Bind(
			auth.NewV1(),
		)
	})
	s.Group("/admin", func(group *ghttp.RouterGroup) {
		group.Middleware(middleware.RequireAuth)
		group.Middleware(middleware.RequireAdminAuth)
		group.Middleware(ghttp.MiddlewareHandlerResponse)
		group.Bind(
			admin.NewV1(),
		)
	})

	// Serve static
	filePath := "resource/public"
	s.SetServerRoot(filePath)
	s.BindStatusHandler(http.StatusNotFound, func(r *ghttp.Request) {
		if strings.HasPrefix(r.Request.URL.Path, "/api") ||
			strings.HasPrefix(r.Request.URL.Path, "/auth") ||
			strings.HasPrefix(r.Request.URL.Path, "/admin") {
			r.Response.WriteStatus(http.StatusNotFound)
			return
		}
		r.Response.ServeFile(filePath + "/index.html")
	})
}
