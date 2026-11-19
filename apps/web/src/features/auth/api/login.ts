import { api } from "@/lib/api";
import type { LoginPayload } from "@/types/auth";

export function loginRequest(payload: LoginPayload) {
  return api.login(payload);
}
