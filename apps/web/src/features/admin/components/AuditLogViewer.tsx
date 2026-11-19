import { useQuery } from "@tanstack/react-query";
import { getAuditLogs, type AuditLogRow } from "../api/getAuditLogs";
import { useState } from "react";
import { formatRelative } from "@/lib/utils";
import {
  ShieldAlert,
  KeyRound,
  FileText,
  MapPin,
  ToggleLeft,
  Search,
  Filter,
} from "lucide-react";

function getActionBadgeStyle(action: string) {
  if (action.includes("FAILED") || action.includes("REVOKE") || action.includes("DELETE")) {
    return {
      bg: "bg-rose-100 text-rose-800 ring-rose-600/20",
      icon: ShieldAlert,
    };
  }
  if (action.includes("LOGIN") || action.includes("AUTH")) {
    return {
      bg: "bg-blue-100 text-blue-800 ring-blue-600/20",
      icon: KeyRound,
    };
  }
  if (action.includes("INCIDENT") || action.includes("DISPATCH")) {
    return {
      bg: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
      icon: FileText,
    };
  }
  if (action.includes("POLYGON") || action.includes("GEOFENCE") || action.includes("AREA")) {
    return {
      bg: "bg-purple-100 text-purple-800 ring-purple-600/20",
      icon: MapPin,
    };
  }
  if (action.includes("DRILL") || action.includes("MODE") || action.includes("SETTINGS")) {
    return {
      bg: "bg-amber-100 text-amber-800 ring-amber-600/20",
      icon: ToggleLeft,
    };
  }
  return {
    bg: "bg-slate-100 text-slate-800 ring-slate-600/20",
    icon: FileText,
  };
}

export function AuditLogViewer() {
  const { data: logs, isLoading, error } = useQuery<AuditLogRow[]>({
    queryKey: ["audit"],
    queryFn: getAuditLogs,
  });
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
        Loading Bhopal Grid audit telemetry…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-xs text-rose-700">
        Failed to fetch audit log. Check backend connection.
      </div>
    );
  }

  const items = logs || [];
  const filtered = items.filter((row) => {
    const matchesSearch =
      !query.trim() ||
      row.action.toLowerCase().includes(query.toLowerCase()) ||
      row.actor.toLowerCase().includes(query.toLowerCase()) ||
      row.target.toLowerCase().includes(query.toLowerCase());

    const matchesAction =
      actionFilter === "all" ||
      (actionFilter === "auth" && (row.action.includes("LOGIN") || row.action.includes("AUTH"))) ||
      (actionFilter === "incident" && row.action.includes("INCIDENT")) ||
      (actionFilter === "config" && (row.action.includes("DRILL") || row.action.includes("POLYGON")));

    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-4">
      {/* Search and Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit action, actor or target..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-64 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Category:
          </span>
          {[
            { id: "all", label: "All Events" },
            { id: "auth", label: "Auth / Security" },
            { id: "incident", label: "Incidents" },
            { id: "config", label: "System Config" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActionFilter(cat.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                actionFilter === cat.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log Entries List */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        {filtered.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {filtered.map((row) => {
              const { bg, icon: ActionIcon } = getActionBadgeStyle(row.action);

              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 py-3.5 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-wide ring-1 ring-inset ${bg}`}
                    >
                      <ActionIcon className="h-3.5 w-3.5 shrink-0" />
                      {row.action}
                    </span>

                    <div className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800">{row.actor}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-mono text-[11px] text-slate-600 truncate max-w-xs sm:max-w-md">
                          {row.target}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[11px] font-medium text-slate-400 shrink-0">
                    {formatRelative(row.at)}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            No audit records match the selected filter.
          </div>
        )}
      </div>
    </div>
  );
}
