import { mockApi } from "@/lib/mock-api";
import type { RegisterPayload } from "@/types/auth";

export function registerRequest(payload: RegisterPayload) {
  return mockApi.register(payload);
}
