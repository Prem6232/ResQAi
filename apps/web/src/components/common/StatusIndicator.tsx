import { cn } from "@/lib/utils";

export function StatusIndicator({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "danger" | "ok" | "warn" | "neutral" | "info";
}) {
  const tones = {
    danger: "bg-sos-50 text-sos-600",
    ok: "bg-duty-50 text-duty-600",
    warn: "bg-amber-50 text-amber-800",
    info: "bg-sky-50 text-sky-800",
    neutral: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
