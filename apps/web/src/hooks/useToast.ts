import { useContext } from "react";
import { ToastCtx } from "@/components/ui/toastContext";

export function useToast() {
  return useContext(ToastCtx);
}
