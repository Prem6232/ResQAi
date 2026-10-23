import { useEffect, useRef, useState } from "react";
import { apiConfig } from "@/config/api.config";
import type { WsEvent } from "@/types/websocket";

function parseJwtExp(token: string): number | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = parseJwtExp(token);
  if (!exp) return false;
  // Consider expired if within 30 seconds of expiry
  return Date.now() >= (exp - 30) * 1000;
}

async function getOrRefreshToken(): Promise<string | null> {
  const raw = localStorage.getItem("sg.tokens");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const token = parsed.accessToken || "";
    if (token && !isTokenExpired(token)) {
      return token;
    }

    // Access token is expired, try refreshing using refreshToken
    const refreshToken = parsed.refreshToken;
    if (!refreshToken) {
      return null;
    }

    const res = await fetch(`${apiConfig.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken, refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // Refresh token is also invalid or expired
      localStorage.removeItem("sg.session");
      localStorage.removeItem("sg.tokens");
      window.dispatchEvent(new Event("sg:auth-changed"));
      return null;
    }

    const data = await res.json();
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
    return newTokens.accessToken;
  } catch {
    return null;
  }
}

export function useWebSocket(enabled: boolean) {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || apiConfig.useMock) {
      setConnected(false);
      return;
    }
    let ws: WebSocket | undefined;
    let attempt = 0;
    let timer: number | undefined;
    let isCleanedUp = false;

    const connect = async () => {
      if (isCleanedUp) return;

      const token = await getOrRefreshToken();
      if (!token) {
        // No valid token available (expired or logged out)
        setConnected(false);
        // Do not connect or hammer the server with dead tokens!
        return;
      }

      if (isCleanedUp) return;

      const wsUrl = `${apiConfig.wsUrl}?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isCleanedUp) return;
        setConnected(true);
        attempt = 0;
      };

      ws.onmessage = (msg) => {
        if (isCleanedUp) return;
        try {
          const event = JSON.parse(msg.data) as WsEvent;
          if (event && event.id) {
            if (seen.current.has(event.id)) return;
            seen.current.add(event.id);
            setEvents((e) => [event, ...e].slice(0, 50));
          }
        } catch {
          // ignore non-json messages (e.g. heartbeat pongs)
        }
      };

      ws.onclose = async (event) => {
        if (isCleanedUp) return;
        setConnected(false);

        // If rejected due to unauthorized / expired token
        if (event.code === 4001 || event.code === 4401 || event.code === 1008) {
          console.warn("[WebSocket] Handshake rejected with auth error. Attempting silent token refresh...");
          const refreshedToken = await getOrRefreshToken();
          if (refreshedToken && !isCleanedUp) {
            // Reconnect once with newly minted token
            timer = window.setTimeout(connect, 1000);
          } else {
            // Stale session. Stop retry loop completely.
            console.warn("[WebSocket] Unable to refresh token. Halting connection loop.");
          }
          return;
        }

        // Normal network disconnect: exponential backoff (1s, 2s, 4s, 8s, max 15s)
        attempt += 1;
        const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempt, 4));
        timer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // Error will be followed by onclose
      };
    };

    connect();

    // Reconnect immediately if user logs in or tokens are refreshed
    const handleAuthChanged = () => {
      if (timer) window.clearTimeout(timer);
      attempt = 0;
      if (ws) {
        ws.close();
      }
      connect();
    };

    window.addEventListener("sg:auth-changed", handleAuthChanged);
    window.addEventListener("storage", handleAuthChanged);

    return () => {
      isCleanedUp = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("sg:auth-changed", handleAuthChanged);
      window.removeEventListener("storage", handleAuthChanged);
      ws?.close();
    };
  }, [enabled]);

  return { events, connected };
}
