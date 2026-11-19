import type { ReactNode } from "react";
import { CommandSidebar } from "./Sidebar";
import { Radio, ShieldCheck, MapPin } from "lucide-react";

export function CommandShell({
  children,
  mode,
  title,
  subtitle,
}: {
  children: ReactNode;
  mode: "operator" | "admin";
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-dvh bg-slate-50/70 text-slate-900 antialiased">
      <CommandSidebar mode={mode} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sleek Tactical Operational Status Bar */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-6 py-2 text-xs font-medium backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-slate-800">
              Bhopal Metropolitan Command Grid
            </span>
            <span className="hidden text-slate-400 sm:inline">|</span>
            <span className="hidden items-center gap-1 text-slate-500 sm:inline-flex">
              <MapPin className="h-3 w-3 text-emerald-600" />
              Zone: MP-04 (23.2599° N, 77.4126° E)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <Radio className="h-3 w-3 animate-pulse" />
              Live Telemetry Active
            </span>
            <span className="hidden items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 md:inline-flex">
              <ShieldCheck className="h-3 w-3 text-blue-600" />
              HITL Verified
            </span>
          </div>
        </div>

        {/* Page Header */}
        <header className="flex items-center justify-between border-b border-slate-200/50 bg-white px-8 py-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {mode === "operator" ? "Operator Console" : "Admin Console"}
            </span>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
