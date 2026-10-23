import { Platform } from "react-native";

/**
 * ResQAi Backend Configuration for Mobile App
 * - Production Cloud: resqai-api.onrender.com (HTTPS / WSS)
 * - Local Development: 192.168.1.5:8000 (Physical device Wi-Fi) or 10.0.2.2:8000 (Android Emulator)
 */
export const PROD_HOST = "resqai-api.onrender.com";
export const LOCAL_HOST = Platform.OS === "android" ? "10.0.2.2:8000" : "localhost:8000";

// Connect to live cloud backend so physical phones work anywhere immediately
export const API_BASE_URL = `https://${PROD_HOST}/api/v1`;
export const WS_BASE_URL = `wss://${PROD_HOST}/ws`;

export const DEMO_CREDENTIALS = {
  citizen: { email: "citizen@campus.demo", password: "demo1234" },
  responder: { email: "responder@campus.demo", password: "demo1234" },
  operator: { email: "operator@campus.demo", password: "demo1234" },
  admin: { email: "admin@campus.demo", password: "demo1234" },
} as const;
