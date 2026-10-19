export const apiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
  wsUrl: import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws",
  useMock: (import.meta.env.VITE_USE_MOCK_API ?? "true") !== "false",
  requestTimeoutMs: 12_000,
} as const;
