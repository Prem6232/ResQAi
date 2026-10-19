import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-amber-200 bg-warn-50 px-4 py-3 text-sm", className)}>
      {children}
    </div>
  );
}
