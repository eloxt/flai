import { Navigate, Outlet } from "react-router"
import { useAuthStore } from "~/store/auth-store"

export default function PublicRoute() {
  const signedIn = useAuthStore((s) => Boolean(s.tokens))
  return signedIn ? <Navigate to="/" replace /> : <Outlet />
}
