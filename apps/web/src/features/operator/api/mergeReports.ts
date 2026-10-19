export async function mergeReports(reportIds: string[], reason: string) {
  return { reportIds, reason, preservedEvidence: true };
}
