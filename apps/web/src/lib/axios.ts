import axios from "axios";
import { apiConfig } from "@/config/api.config";

export const http = axios.create({
  baseURL: apiConfig.baseUrl,
  timeout: apiConfig.requestTimeoutMs,
});

http.interceptors.request.use((config) => {
  const raw = localStorage.getItem("sg.tokens");
  if (raw) {
    try {
      const tokens = JSON.parse(raw) as { accessToken: string };
      if (tokens.accessToken) {
        config.headers.Authorization = `Bearer ${tokens.accessToken}`;
      }
    } catch {
      // ignore
    }
  }
  config.headers["X-Request-Id"] = crypto.randomUUID();
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes("/auth/refresh") || originalRequest.url?.includes("/auth/login")) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return http(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const raw = localStorage.getItem("sg.tokens");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const refreshToken = parsed.refreshToken;
          if (refreshToken) {
            const res = await axios.post(`${apiConfig.baseUrl}/auth/refresh`, {
              refreshToken,
              refresh_token: refreshToken,
            });
            const data = res.data;
            const newTokens = {
              accessToken: data.accessToken || data.access_token,
              refreshToken: data.refreshToken || data.refresh_token,
              expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
            };
            localStorage.setItem("sg.tokens", JSON.stringify(newTokens));
            const sessRaw = localStorage.getItem("sg.session");
            if (sessRaw) {
              const sess = JSON.parse(sessRaw);
              sess.tokens = newTokens;
              localStorage.setItem("sg.session", JSON.stringify(sess));
            }
            window.dispatchEvent(new Event("sg:auth-changed"));
            processQueue(null, newTokens.accessToken);
            originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
            return http(originalRequest);
          }
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          localStorage.removeItem("sg.session");
          localStorage.removeItem("sg.tokens");
          window.dispatchEvent(new Event("sg:auth-changed"));
        } finally {
          isRefreshing = false;
        }
      }
    }
    return Promise.reject(error);
  }
);
