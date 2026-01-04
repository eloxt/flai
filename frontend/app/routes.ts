import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("/share/:id", "./page/share.tsx"),
  layout("./layout/public-route.tsx", [
    layout("./layout/auth-layout.tsx", [
      route("/login", "./page/login.tsx"),
      route("/register", "./page/register.tsx"),
      route("/activation-pending", "./page/activation-pending.tsx"),
    ]),
  ]),
  layout("./layout/protected-route.tsx", [
    layout("./layout/sidebar-layout.tsx", [
      index("./main.tsx"),
      route("/chat/:conversationId", "./page/chat.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
