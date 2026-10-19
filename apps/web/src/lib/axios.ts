import axios from "axios";
import { apiConfig } from "@/config/api.config";

export const http = axios.create({
  baseURL: apiConfig.baseUrl,
  timeout: apiConfig.requestTimeoutMs,
});

http.interceptors.request.use((config) => {
  const raw = localStorage.getItem("sg.tokens");
  if (raw) {
    const tokens = JSON.parse(raw) as { accessToken: string };
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  config.headers["X-Request-Id"] = crypto.randomUUID();
  return config;
});
