const defaultBaseUrl =
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "/api/v1"
    : "https://resqai-6s8c.onrender.com/api/v1";

const defaultWsUrl =
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
    : "wss://resqai-6s8c.onrender.com/ws";

export const apiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? defaultBaseUrl,
  wsUrl: import.meta.env.VITE_WS_URL ?? defaultWsUrl,
  useMock: import.meta.env.VITE_USE_MOCK_API === "true", // Default is FALSE (100% Live Backend)
  requestTimeoutMs: 15_000,
} as const;
