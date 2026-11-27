import { WS_BASE_URL } from "../config/api";
import { mobileApi } from "./api";

type MessageHandler = (data: any) => void;

class MobileRealtimeService {
  private socket: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private shouldReconnect = false;

  connect() {
    const token = mobileApi.getAccessToken();
    if (!token) {
      return;
    }

    this.shouldReconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const url = `${WS_BASE_URL}?token=${encodeURIComponent(token)}`;

    try {
      this.isConnecting = true;
      const ws = new WebSocket(url);
      this.socket = ws;

      ws.onopen = () => {
        if (this.socket !== ws) return;
        this.isConnecting = false;
        console.log("🟢 Mobile Realtime WebSocket connected to ResQAi backend");
      };

      ws.onmessage = (event) => {
        if (this.socket !== ws) return;
        try {
          const data = JSON.parse(event.data);
          this.listeners.forEach((handler) => handler(data));
        } catch (e) {
          console.warn("Failed to parse websocket message", e);
        }
      };

      ws.onerror = (err) => {
        if (this.socket !== ws) return;
        console.warn("WebSocket error:", err);
      };

      ws.onclose = async (ev) => {
        if (this.socket !== ws) return;
        this.socket = null;
        this.isConnecting = false;
        if (!this.shouldReconnect) return;

        if (ev?.code === 4001 || ev?.code === 4401 || ev?.code === 1008) {
          try {
            await mobileApi.refreshSession();
          } catch {
            this.shouldReconnect = false;
            return;
          }
        }

        if (!this.shouldReconnect || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (this.shouldReconnect) {
            this.connect();
          }
        }, 5000);
      };
    } catch (e) {
      this.isConnecting = false;
      console.warn("Failed to create WebSocket", e);
    }
  }

  subscribe(handler: MessageHandler) {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.isConnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      const prev = this.socket;
      this.socket = null;
      prev.onopen = null;
      prev.onmessage = null;
      prev.onerror = null;
      prev.onclose = null;
      prev.close();
    }
  }
}

export const mobileRealtime = new MobileRealtimeService();
