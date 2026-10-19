import type { ReactNode, TableHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-left text-sm", className)} {...props} />;
}

export function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-700/50">{children}</th>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-3", className)}>{children}</td>;
}
