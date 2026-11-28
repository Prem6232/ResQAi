import { Platform } from "react-native";

/**
 * ResQAi Backend Configuration for Mobile App
 * - Production Cloud: resqai-api.onrender.com (HTTPS / WSS)
 * - Local Development: 192.168.1.5:8000 (Physical device Wi-Fi) or 10.0.2.2:8000 (Android Emulator)
 */
export const PROD_HOST = "resqai-6s8c.onrender.com";
export const LOCAL_HOST = Platform.OS === "android" ? "10.0.2.2:8000" : "localhost:8000";

const envApiUrl = typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_API_URL : undefined;
const envWsUrl = typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_WS_URL : undefined;
const useLocal = typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_USE_LOCAL === "true" : false;
const activeHost = useLocal ? LOCAL_HOST : PROD_HOST;
const httpScheme = useLocal ? "http" : "https";
const wsScheme = useLocal ? "ws" : "wss";

// Uses EXPO_PUBLIC_API_URL when configured; otherwise selects local dev or cloud backend
export const API_BASE_URL = envApiUrl || `${httpScheme}://${activeHost}/api/v1`;
export const WS_BASE_URL = envWsUrl || `${wsScheme}://${activeHost}/ws`;

export const DEMO_CREDENTIALS = {
  citizen: { email: "citizen@campus.demo", password: "demo1234" },
  responder: { email: "responder@campus.demo", password: "demo1234" },
  operator: { email: "operator@campus.demo", password: "demo1234" },
  admin: { email: "admin@campus.demo", password: "demo1234" },
} as const;
