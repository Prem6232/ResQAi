import { CommandShell } from "@/components/common/CommandShell";
import {
  mockApi,
  type AnalyticsSummary,
  type CategoryBreakdownItem,
  type ResponseTimeStats,
} from "@/lib/mock-api";
import { useEffect, useState } from "react";

export function OperationalAnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdownItem[]>([]);
  const [responseStats, setResponseStats] = useState<ResponseTimeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      mockApi.analyticsSummary(),
      mockApi.analyticsByCategory(),
      mockApi.analyticsResponseTimes(),
    ])
      .then(([sum, cat, rt]) => {
        if (!active) return;
        setSummary(sum);
        setCategories(cat.categories || []);
        setResponseStats(rt);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <CommandShell mode="admin" title="Operational analytics">
      <p className="mb-4 text-xs text-ink-700/60">
        Live operational KPIs and category breakdown from the backend analytics service.
      </p>
      {loading ? (
        <p className="text-sm text-ink-700/50">Loading operational analytics…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Total incidents" value={String(summary?.totalIncidents ?? 0)} />
            <Metric label="Active incidents" value={String(summary?.activeIncidents ?? 0)} />
            <Metric label="Resolved incidents" value={String(summary?.resolvedIncidents ?? 0)} />
            <Metric
              label="Avg arrival time"
              value={`${(summary?.avgArrivalTimeMinutes ?? 0).toFixed(1)}m`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl bg-white p-5 shadow-card">
              <h2 className="mb-3 text-sm font-semibold">Category distribution</h2>
              {categories.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {categories.map((c) => (
                    <li key={c.category} className="flex items-center justify-between">
                      <span>{c.name}</span>
                      <span className="font-mono text-xs text-ink-700/70">
                        {c.count} ({c.percentage}%)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-700/50">No categorized incidents yet.</p>
              )}
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-card">
              <h2 className="mb-3 text-sm font-semibold">Response phase milestones</h2>
              {responseStats?.milestones?.length ? (
                <ul className="space-y-2 text-sm">
                  {responseStats.milestones.map((m) => (
                    <li key={m.phase} className="flex items-center justify-between">
                      <span className="capitalize">{m.phase.replaceAll("_", " ")}</span>
                      <span className="font-mono text-xs text-ink-700/70">
                        avg {Math.round(m.avgSeconds ?? m.avg_seconds ?? 0)}s · p95{" "}
                        {Math.round(m.p95Seconds ?? m.p95_seconds ?? 0)}s
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-700/50">No milestone timing records available.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </CommandShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card">
      <p className="text-xs text-ink-700/50">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}
