import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "../store/auth-store";

export default function PublicRoute() {
    const expiresAt = useAuthStore((state) => state.expiresAt);

    // Check if user is already authenticated
    if (expiresAt && new Date() < new Date(expiresAt)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}
