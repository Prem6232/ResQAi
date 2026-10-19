import type { Incident } from "@/types/incident";
import { urgencyMeta } from "@/lib/categories";
import { cn } from "@/lib/utils";

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
    <div className="space-y-2">
      {incidents.map((inc) => (
        <button
          key={inc.id}
          type="button"
          onClick={() => onSelect(inc.id)}
          className={cn(
            "w-full rounded-2xl border px-3 py-3 text-left",
            selectedId === inc.id ? "border-command-500 bg-command-50" : "border-black/5 bg-white",
          )}
        >
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", urgencyMeta[inc.urgency].className)}>
            {urgencyMeta[inc.urgency].label}
          </span>
          <p className="mt-1 text-sm font-semibold">{inc.title}</p>
          <p className="text-xs text-ink-700/50">
            {inc.locationLabel} · {inc.reportIds.length} reports
            {inc.synthetic ? " · synthetic" : ""}
          </p>
        </button>
      ))}
    </div>
  );
}
