import { permissionMatrix, type Permission } from "@/config/permissions.config";
import { useAuth } from "./useAuth";

export function usePermission(permission: Permission) {
  const { user } = useAuth();
  if (!user) return false;
  return permissionMatrix[permission].some((role) => user.roles.includes(role));
}
