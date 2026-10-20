import { WS_BASE_URL } from "../config/api";
import { mobileApi } from "./api";

type MessageHandler = (data: any) => void;

class MobileRealtimeService {
  private socket: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectTimer: any = null;
  private isConnecting = false;

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = mobileApi.getAccessToken();
    const url = token ? `${WS_BASE_URL}?token=${token}` : WS_BASE_URL;

    try {
      this.isConnecting = true;
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.isConnecting = false;
        console.log("🟢 Mobile Realtime WebSocket connected to ResQAi backend");
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.listeners.forEach((handler) => handler(data));
        } catch (e) {
          console.warn("Failed to parse websocket message", e);
        }
      };

      this.socket.onerror = (err) => {
        console.warn("WebSocket error:", err);
      };

      this.socket.onclose = () => {
        this.socket = null;
        this.isConnecting = false;
        // Schedule auto-reconnect
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 5000);
        }
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

export const mobileRealtime = new MobileRealtimeService();
