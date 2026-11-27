import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CommandShell } from "@/components/common/CommandShell";
import { DemoDrillModeToggle } from "@/features/admin/components/DemoDrillModeToggle";
import { getAuditLogs } from "@/features/admin/api/getAuditLogs";
import { getRespondersList } from "@/features/admin/api/getRespondersList";
import { api, type AnalyticsSummary } from "@/lib/api";
import { routes } from "@/config/routes.config";
import { ArrowRight, BarChart3, Clock, FileSearch, MapPin, ShieldCheck, Users } from "lucide-react";

export function AdminDashboard() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [pendingResponders, setPendingResponders] = useState(0);
  const [approvedResponders, setApprovedResponders] = useState(0);
  const [auditCount, setAuditCount] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([api.analyticsSummary(), getRespondersList(), getAuditLogs()]).then(
      ([sum, roster, logs]) => {
        if (!active) return;
        setSummary(sum);
        setPendingResponders(roster.filter((r) => !r.approved).length);
        setApprovedResponders(roster.filter((r) => r.approved).length);
        setAuditCount(logs.length);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const quickLinks = [
    {
      to: routes.admin.responders,
      title: "Responder approval",
      desc: "Vet pending sign-ups or revoke responder dispatch access.",
      badge: `${pendingResponders} pending`,
      icon: Users,
    },
    {
      to: routes.admin.geofence,
      title: "Operating areas",
      desc: "Adjust Bhopal metropolitan PostGIS geofence polygon boundaries.",
      badge: "SRID 4326",
      icon: MapPin,
    },
    {
      to: routes.admin.audit,
      title: "Security audit",
      desc: "Inspect immutable authentication, dispatch, and admin events.",
      badge: `${auditCount} events`,
      icon: FileSearch,
    },
    {
      to: routes.admin.analytics,
      title: "Analytics",
      desc: "Review active incident totals, categories, and SLA phase timings.",
      badge: `${summary?.activeIncidents ?? 0} active`,
      icon: BarChart3,
    },
  ];

  return (
    <CommandShell
      mode="admin"
      title="Administrator"
      subtitle="Platform governance, responder vetting, Bhopal geofencing, and security oversight"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <StatCard label="Pending Approvals" value={String(pendingResponders)} icon={Clock} highlight={pendingResponders > 0} />
          <StatCard label="Approved Fleet" value={String(approvedResponders)} icon={ShieldCheck} />
          <StatCard label="Active Incidents" value={String(summary?.activeIncidents ?? 0)} icon={BarChart3} />
          <StatCard label="Audit Records" value={String(auditCount)} icon={FileSearch} />
        </div>

        <DemoDrillModeToggle />

        <div className="grid gap-4 sm:grid-cols-2">
          {quickLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex items-start justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex items-start gap-3.5">
                <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700 group-hover:bg-slate-900 group-hover:text-emerald-400 transition">
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">{item.title}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-800" />
            </Link>
          ))}
        </div>
      </div>
    </CommandShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <Icon className={`h-4 w-4 ${highlight ? "text-amber-600" : "text-emerald-600"}`} />
      </div>
      <p className="mt-2 font-display text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}
