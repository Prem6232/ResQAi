import { api } from "@/lib/api";

export function getRespondersList() {
  return api.responders();
}
