import { createContext } from "react";

export type ToastMsg = { id: string; title: string; description?: string };

export const ToastCtx = createContext<(msg: Omit<ToastMsg, "id">) => void>(() => undefined);
