export const apiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "https://resqai-api.onrender.com/api/v1",
  wsUrl: import.meta.env.VITE_WS_URL ?? "wss://resqai-api.onrender.com/ws",
  useMock: import.meta.env.VITE_USE_MOCK_API === "true", // Default is FALSE (100% Live Backend)
  requestTimeoutMs: 15_000,
} as const;

