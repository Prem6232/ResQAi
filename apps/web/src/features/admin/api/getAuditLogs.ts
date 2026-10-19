export async function getAuditLogs() {
  return [
    {
      id: "aud_1",
      at: new Date().toISOString(),
      actor: "operator@campus.demo",
      action: "VIEW_INCIDENT",
      target: "inc_402",
      synthetic: true as const,
    },
  ];
}
