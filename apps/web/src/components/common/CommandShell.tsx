import type { ReactNode } from "react";
import { CommandSidebar } from "./Sidebar";
import { DisclaimerBanner } from "./DisclaimerBanner";
import { Badge } from "@/components/ui/badge";

export function CommandShell({
  children,
  mode,
  title,
}: {
  children: ReactNode;
  mode: "operator" | "admin";
  title: string;
}) {
  return (
    <div className="flex min-h-dvh bg-[#eef1f6]">
      <CommandSidebar mode={mode} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DisclaimerBanner />
        <header className="flex items-center justify-between px-8 py-5">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
          <div className="flex items-center gap-3 text-xs">
            <Badge className="bg-duty-50 text-duty-600">Command center · Live</Badge>
            <span className="text-ink-700/50">Synthetic drill data</span>
          </div>
        </header>
        <main className="flex-1 px-8 pb-10">{children}</main>
      </div>
    </div>
  );
}
