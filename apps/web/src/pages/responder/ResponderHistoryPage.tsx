import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";
import type { Assignment } from "@/types/assignment";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { formatRelative } from "@/lib/utils";

export function ResponderHistoryPage() {
  const [history, setHistory] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mockApi
      .responderHistory()
      .then(setHistory)
      .finally(() => setLoading(false));
  }, []);

  const etaValues = history
    .map((item) => item.etaMinutes)
    .filter((eta): eta is number => typeof eta === "number" && eta > 0);
  const avgEta =
    etaValues.length > 0
      ? `${(etaValues.reduce((sum, v) => sum + v, 0) / etaValues.length).toFixed(1)}m`
      : "—";

  const acceptedOrCompleted = history.filter(
    (item) => item.status !== "declined" && item.status !== "expired"
  ).length;
  const acceptRate =
    history.length > 0 ? `${Math.round((acceptedOrCompleted / history.length) * 100)}%` : "—";

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
                  {item.incident?.locationLabel ?? "Campus Perimeter"} ·{" "}
                  {formatRelative(item.completedAt || item.offeredAt)}
                </p>
              </div>
              <StatusIndicator
                label={item.status.replaceAll("_", " ")}
                tone={item.status === "completed" ? "ok" : "neutral"}
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
