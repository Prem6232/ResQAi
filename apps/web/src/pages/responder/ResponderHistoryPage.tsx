import { api } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import type { Assignment } from "@/types/assignment";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { formatRelative } from "@/lib/utils";
import { useLiveEvents } from "@/hooks/useLiveEvents";

function statusTone(status: Assignment["status"]): "ok" | "danger" | "warn" | "neutral" {
  if (status === "completed") return "ok";
  if (status === "failed") return "danger";
  if (status === "expired" || status === "declined") return "warn";
  return "neutral";
}

export function ResponderHistoryPage() {
  const { events } = useLiveEvents();
  const [history, setHistory] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(() => {
    api
      .responderHistory()
      .then(setHistory)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    if (
      latest.type === "assignment.updated" ||
      latest.type === "assignment.expired" ||
      latest.type === "assignment.failed"
    ) {
      loadHistory();
    }
  }, [events, loadHistory]);

  const etaValues = history
    .map((item) => item.etaMinutes)
    .filter((eta): eta is number => typeof eta === "number" && eta > 0);
  const avgEta =
    etaValues.length > 0
      ? `${(etaValues.reduce((sum, v) => sum + v, 0) / etaValues.length).toFixed(1)}m`
      : "—";

  const responderAnswered = history.filter((item) => item.status !== "cancelled");
  const acceptedOrCompleted = responderAnswered.filter(
    (item) => item.status !== "declined" && item.status !== "expired"
  ).length;
  const acceptRate =
    responderAnswered.length > 0
      ? `${Math.round((acceptedOrCompleted / responderAnswered.length) * 100)}%`
      : "—";

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">History</h1>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat n={String(history.length)} l="Past Missions" />
        <Stat n={avgEta} l="Avg ETA" />
        <Stat n={acceptRate} l="Accept rate" />
      </div>
      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="text-sm text-ink-700/50">Loading mission history…</p>
        ) : history.length === 0 ? (
          <p className="rounded-3xl bg-white p-4 text-sm text-ink-700/50 shadow-card">
            No completed or past missions yet.
          </p>
        ) : (
          history.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-card">
              <div>
                <p className="font-medium">
                  {item.incident?.title ?? `Incident ${item.incidentId.slice(0, 6)}`}
                </p>
                <p className="text-xs text-ink-700/50">
                  {item.incident?.locationLabel ?? "Bhopal Metro"} ·{" "}
                  {formatRelative(item.completedAt || item.offeredAt)}
                </p>
              </div>
              <StatusIndicator
                label={item.status.replaceAll("_", " ")}
                tone={statusTone(item.status)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-3xl bg-white p-3 text-center shadow-card">
      <p className="font-display text-xl font-bold">{n}</p>
      <p className="text-[10px] text-ink-700/50">{l}</p>
    </div>
  );
}
