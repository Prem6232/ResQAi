import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { routes } from "@/config/routes.config";

export function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to={routes.login} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
