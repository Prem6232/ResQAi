import { useEffect, useRef, useState } from "react";
import { apiConfig } from "@/config/api.config";
import type { WsEvent } from "@/types/websocket";

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

    const connect = () => {
      ws = new WebSocket(apiConfig.wsUrl);
      ws.onopen = () => {
        setConnected(true);
        attempt = 0;
      };
      ws.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as WsEvent;
        if (seen.current.has(event.id)) return;
        seen.current.add(event.id);
        setEvents((e) => [event, ...e].slice(0, 50));
      };
      ws.onclose = () => {
        setConnected(false);
        attempt += 1;
        timer = window.setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, [enabled]);

  return { events, connected };
}
