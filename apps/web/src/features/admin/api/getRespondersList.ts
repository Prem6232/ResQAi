import { mockApi } from "@/lib/mock-api";

export function getRespondersList() {
  return mockApi.responders();
}
