import { api } from "@/lib/api";
import type { RegisterPayload } from "@/types/auth";

export function registerRequest(payload: RegisterPayload) {
  return api.register(payload);
}
