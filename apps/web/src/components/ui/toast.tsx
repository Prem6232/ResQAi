import * as ToastPrimitive from "@radix-ui/react-toast";
import { createContext, useContext, useState, type ReactNode } from "react";

type ToastMsg = { id: string; title: string; description?: string };

const ToastCtx = createContext<(msg: Omit<ToastMsg, "id">) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const push = (msg: Omit<ToastMsg, "id">) =>
    setToasts((t) => [...t, { ...msg, id: crypto.randomUUID() }]);

  return (
    <ToastCtx.Provider value={push}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            className="fixed bottom-20 right-4 z-[80] w-80 rounded-2xl bg-ink-900 p-4 text-white shadow-card"
            onOpenChange={(open) => {
              if (!open) setToasts((all) => all.filter((x) => x.id !== t.id));
            }}
          >
            <ToastPrimitive.Title className="font-semibold">{t.title}</ToastPrimitive.Title>
            {t.description ? (
              <ToastPrimitive.Description className="mt-1 text-sm text-white/70">
                {t.description}
              </ToastPrimitive.Description>
            ) : null}
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport />
      </ToastPrimitive.Provider>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
