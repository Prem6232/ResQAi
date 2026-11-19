import type { Incident } from "@/types/incident";
import { urgencyMeta, categoryMeta } from "@/lib/categories";
import { cn, formatRelative } from "@/lib/utils";
import { AlertCircle, Flame, ShieldAlert, Car, HelpCircle, Users } from "lucide-react";

const categoryIcons: Record<string, React.ElementType> = {
  fire_hazard: Flame,
  personal_safety: ShieldAlert,
  medical_emergency: AlertCircle,
  road_hazard: Car,
  other: HelpCircle,
};

export function LiveQueueTable({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: Incident[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {incidents.map((inc) => {
        const isSelected = selectedId === inc.id;
        const meta = urgencyMeta[inc.urgency] ?? urgencyMeta.high;
        const isCritical = inc.urgency === "critical";
        const CategoryIcon = categoryIcons[inc.category] || HelpCircle;

        return (
          <button
            key={inc.id}
            type="button"
            onClick={() => onSelect(inc.id)}
            className={cn(
              "group relative w-full rounded-2xl border p-3.5 text-left transition-all duration-150",
              isSelected
                ? "border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-500/30"
                : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-sm"
            )}
          >
            {/* Urgency indicator strip */}
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  isCritical
                    ? "bg-rose-100 text-rose-800 ring-1 ring-rose-600/20"
                    : inc.urgency === "high"
                      ? "bg-amber-100 text-amber-800 ring-1 ring-amber-600/20"
                      : "bg-slate-100 text-slate-700"
                )}
              >
                {isCritical ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600"></span>
                  </span>
                ) : null}
                {meta.label}
              </span>

              <span className="text-[10px] font-medium text-slate-400">
                {formatRelative(inc.createdAt)}
              </span>
            </div>

            {/* Title & Category */}
            <div className="mt-2 flex items-start gap-2">
              <div
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs",
                  isCritical ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"
                )}
              >
                <CategoryIcon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900 group-hover:text-emerald-700">
                  {inc.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {categoryMeta[inc.category]?.label || inc.category.replaceAll("_", " ")}
                </p>
              </div>
            </div>

            {/* Location & Report count */}
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              <span className="truncate font-medium text-slate-600">
                📍 {inc.locationLabel || "Bhopal Metro Region"}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-slate-700">
                <Users className="h-3 w-3 text-slate-400" />
                {inc.reportIds.length} {inc.reportIds.length === 1 ? "report" : "reports"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
