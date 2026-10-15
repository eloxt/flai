import { Navigate, Outlet } from "react-router"
import { useAuthStore } from "~/store/auth-store"

export default function ProtectedRoute() {
  const userId = useAuthStore((s) => s.user?.id)
  const signedIn = useAuthStore((s) => Boolean(s.tokens))
  if (!signedIn) return <Navigate to="/login" replace />
  // Remount everything when the account changes so no state leaks between users.
  return <Outlet key={userId} />
}
