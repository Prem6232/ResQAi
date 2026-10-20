import { Platform } from "react-native";

/**
 * ResQAi Backend Configuration for Mobile App
 * - Default: 192.168.1.5:8000 (accessible by both physical phones on same Wi-Fi & Android emulator)
 * - Android Emulator direct loopback: 10.0.2.2:8000
 */
export const DEFAULT_HOST = "192.168.1.5:8000";

export const API_BASE_URL = `http://${DEFAULT_HOST}/api/v1`;
export const WS_BASE_URL = `ws://${DEFAULT_HOST}/ws`;

export const DEMO_CREDENTIALS = {
  citizen: { email: "citizen@campus.demo", password: "demo1234" },
  responder: { email: "responder@campus.demo", password: "demo1234" },
  operator: { email: "operator@campus.demo", password: "demo1234" },
  admin: { email: "admin@campus.demo", password: "demo1234" },
} as const;
