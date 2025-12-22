import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "../store/auth-store";

export default function ProtectedRoute() {
    const expiresAt = useAuthStore((state) => state.expiresAt);

    // Check if user is authenticated and token is not expired
    if (!expiresAt || new Date() > new Date(expiresAt)) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}
