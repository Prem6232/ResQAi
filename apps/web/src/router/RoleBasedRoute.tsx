import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/types/common";
import { routes } from "@/config/routes.config";
import { MobileShell } from "@/components/common/MobileShell";

export function RoleBasedRoute({ roles, mobile }: { roles: Role[]; mobile?: "citizen" | "responder" }) {
  const { user } = useAuth();
  if (!user || !user.roles.some((r) => roles.includes(r))) {
    return <Navigate to={routes.unauthorized} replace />;
  }
  if (mobile) {
    return (
      <MobileShell variant={mobile}>
        <Outlet />
      </MobileShell>
    );
  }
  return <Outlet />;
}
