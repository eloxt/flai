import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  route("/share/:id", "./pages/share.tsx"),
  layout("./layouts/public-route.tsx", [
    layout("./layouts/auth-layout.tsx", [
      route("/login", "./pages/login.tsx"),
      route("/register", "./pages/register.tsx"),
      route("/activation-pending", "./pages/activation-pending.tsx"),
    ]),
  ]),
  layout("./layouts/protected-route.tsx", [
    layout("./layouts/app-layout.tsx", [
      index("./pages/home.tsx"),
      route("/search", "./pages/search.tsx"),
      route("/chat/:conversationId", "./pages/chat.tsx"),
      route("/translate", "./pages/translate.tsx"),
      route("/dev/genui", "./pages/genui-gallery.tsx"),
    ]),
  ]),
] satisfies RouteConfig
