import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("./layout/public-route.tsx", [
    layout("./layout/auth-layout.tsx", [
      route("/login", "./page/login.tsx"),
      route("/register", "./page/register.tsx"),
    ]),
  ]),
  layout("./layout/protected-route.tsx", [
    layout("./layout/sidebar-layout.tsx", [
      index("./main.tsx"),
      route("/chat/:conversationId", "./page/chat.tsx"),
      route("/search", "./page/search.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
