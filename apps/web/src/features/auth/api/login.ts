import { mockApi } from "@/lib/mock-api";
import type { LoginPayload } from "@/types/auth";

export function loginRequest(payload: LoginPayload) {
  return mockApi.login(payload);
}
