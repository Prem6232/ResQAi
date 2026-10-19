import { mockApi } from "@/lib/mock-api";

export function getReportQueue() {
  return mockApi.myReports();
}
