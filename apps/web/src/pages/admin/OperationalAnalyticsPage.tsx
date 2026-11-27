import { CommandShell } from "@/components/common/CommandShell";
import {
  api,
  type AnalyticsSummary,
  type CategoryBreakdownItem,
  type ResponseTimeStats,
} from "@/lib/api";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck, Timer, Truck } from "lucide-react";

export function OperationalAnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdownItem[]>([]);
  const [responseStats, setResponseStats] = useState<ResponseTimeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.analyticsSummary(),
      api.analyticsByCategory(),
      api.analyticsResponseTimes(),
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

  const hasTimingSamples = Boolean(
    responseStats?.milestones?.some((m) => (m.avgSeconds ?? m.avg_seconds ?? 0) > 0)
  );

  return (
    <CommandShell
      mode="admin"
      title="Operational analytics"
      subtitle="Live incident totals, active fleet readiness, category breakdown, and assignment timing"
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading operational analytics…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-6">
            <Metric label="Total incidents" value={String(summary?.totalIncidents ?? 0)} icon={Activity} />
            <Metric label="Active incidents" value={String(summary?.activeIncidents ?? 0)} icon={AlertTriangle} />
            <Metric label="Resolved" value={String(summary?.resolvedIncidents ?? 0)} icon={CheckCircle2} />
            <Metric label="Active units" value={String(summary?.activeRespondersCount ?? 0)} icon={Truck} />
            <Metric
              label="False-alarm rate"
              value={`${(summary?.falseAlarmRate ?? 0).toFixed(1)}%`}
              icon={ShieldCheck}
            />
            <Metric
              label="Avg response"
              value={`${(summary?.avgArrivalTimeMinutes ?? 0).toFixed(1)}m`}
              icon={Timer}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">
                Category distribution
              </h2>
              {categories.length > 0 ? (
                <ul className="space-y-2.5 text-sm">
                  {categories.map((c) => (
                    <li key={c.category} className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{c.name}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                        {c.count} ({c.percentage}%)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No categorized incidents recorded yet.</p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">
                Response phase milestones
              </h2>
              {responseStats?.milestones?.length && hasTimingSamples ? (
                <ul className="space-y-2.5 text-sm">
                  {responseStats.milestones.map((m) => (
                    <li key={m.phase} className="flex items-center justify-between">
                      <span className="font-medium capitalize text-slate-800">
                        {m.phase.replaceAll("_", " ")}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                        avg {Math.round(m.avgSeconds ?? m.avg_seconds ?? 0)}s · p95{" "}
                        {Math.round(m.p95Seconds ?? m.p95_seconds ?? 0)}s
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">
                  No completed assignment timing samples recorded yet. Real averages will appear once units complete dispatches.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </CommandShell>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <Icon className="h-3.5 w-3.5 text-emerald-600" />
      </div>
      <p className="mt-1.5 font-display text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}
