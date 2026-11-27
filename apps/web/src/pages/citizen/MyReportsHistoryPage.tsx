import { MobileHeader } from "@/components/common/Header";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyReports } from "@/features/citizen/api/getMyReports";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { formatRelative } from "@/lib/utils";
import { categoryMeta } from "@/lib/categories";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { OfflineReportDraftsList } from "@/features/citizen/components/OfflineReportDraftsList";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveEvents } from "@/hooks/useLiveEvents";

export function MyReportsHistoryPage() {
  const queryClient = useQueryClient();
  const { events } = useLiveEvents();
  const q = useQuery({ queryKey: ["my-reports"], queryFn: getMyReports });

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    if (
      latest.type === "report.received" ||
      latest.type === "report.cancelled" ||
      latest.type === "incident.updated"
    ) {
      void queryClient.invalidateQueries({ queryKey: ["my-reports"] });
    }
  }, [events, queryClient]);

  return (
    <div>
      <MobileHeader role="Citizen" />
      <h1 className="mb-4 font-display text-2xl font-extrabold">My reports</h1>
      {q.isLoading ? <Skeleton className="h-24" /> : null}
      {q.data?.length === 0 ? <p className="text-sm text-ink-700/50">You have not submitted a report yet.</p> : null}
      <div className="space-y-3">
        {q.data?.map((r) => {
          const isCancelled = r.processingState === "cancelled" || Boolean(r.cancelledReason);
          const badgeLabel = isCancelled
            ? "Cancelled"
            : r.deliveryState === "received_by_server"
              ? "Received"
              : "Not delivered";
          const badgeTone = isCancelled ? "neutral" : r.deliveryState === "received_by_server" ? "ok" : "warn";
          return (
            <Link key={r.id} to={routes.citizen.report(r.id)} className="block rounded-3xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{(categoryMeta[r.category] ?? categoryMeta.other).label}</p>
                  <p className="text-xs text-ink-700/50">{formatRelative(r.createdAt)}</p>
                </div>
                <StatusIndicator label={badgeLabel} tone={badgeTone} />
              </div>
              <p className="mt-2 text-sm text-ink-700/70">{r.text}</p>
            </Link>
          );
        })}
      </div>
      <h2 className="mb-2 mt-8 text-sm font-semibold">Offline queue</h2>
      <OfflineReportDraftsList />
    </div>
  );
}
