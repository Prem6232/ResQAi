import { CommandShell } from "@/components/common/CommandShell";
import { api } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import type { ResponderProfile } from "@/types/responder";
import { LiveResponderMap } from "@/components/maps/LiveResponderMap";
import { formatRelative } from "@/lib/utils";
import { formatCoordinates } from "@/components/maps/liveResponderMapUtils";
import {
  Users,
  ShieldCheck,
  Radio,
  Clock,
  MapPin,
  Ambulance,
  Flame,
  Shield,
  Activity,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const typeIcons: Record<string, React.ElementType> = {
  ambulance: Ambulance,
  medical: Ambulance,
  paramedic: Ambulance,
  fire_rescue: Flame,
  fire: Flame,
  campus_security: Shield,
  police: Shield,
  patrol: Shield,
};

export function OperatorRespondersPage() {
  const [responders, setResponders] = useState<ResponderProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const refreshRoster = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.responders();
      setResponders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRoster();
  }, [refreshRoster]);

  const counts = {
    onDuty: responders.filter((r) => r.status !== "offline" && r.status !== "off_duty").length,
    available: responders.filter((r) => r.status === "available").length,
    busy: responders.filter((r) => r.status === "busy").length,
    offline: responders.filter((r) => r.status === "offline" || r.status === "off_duty").length,
  };

  const filtered = responders.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.unitCode.toLowerCase().includes(q) ||
      r.displayName.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    );
  });

  return (
    <CommandShell
      mode="operator"
      title="Bhopal Emergency Fleet"
      subtitle="Live responder telemetry, availability tracking, and GIS deployment status"
    >
      {/* Fleet Status Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Tile
          n={counts.onDuty}
          l="Total On Duty"
          sub="Active in Bhopal"
          icon={Users}
          color="emerald"
        />
        <Tile
          n={counts.available}
          l="Available for Dispatch"
          sub="Ready to assign"
          icon={ShieldCheck}
          color="blue"
        />
        <Tile
          n={counts.busy}
          l="Active in Mission (Busy)"
          sub="En-route / On-scene"
          icon={Activity}
          color="amber"
        />
        <Tile
          n={counts.offline}
          l="Standby / Off-Duty"
          sub="Unreachable"
          icon={Clock}
          color="slate"
        />
      </div>

      {/* Map Overview */}
      <div className="mb-6">
        <LiveResponderMap
          mode="control_room"
          height={380}
          responders={responders}
          selectedResponderId={selectedId}
          onSelectResponder={(r) => setSelectedId(r.id)}
          onRespondersUpdated={setResponders}
        />
      </div>

      {/* Roster Table Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Field Units Roster ({filtered.length} units)
            </h2>
            <p className="text-xs text-slate-500">
              Real-time PostGIS GPS feeds from registered responders
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search unit or type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-hidden"
              />
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshRoster()}
              disabled={loading}
              className="h-8 gap-1.5 rounded-lg border-slate-200 text-xs font-semibold text-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="pb-3 pr-4">Unit Code</th>
                  <th className="pb-3 pr-4">Unit Type</th>
                  <th className="pb-3 pr-4">Availability</th>
                  <th className="pb-3 pr-4">Last GPS Telemetry</th>
                  <th className="pb-3">Current Assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const isSelected = selectedId === r.id;
                  const TypeIcon = typeIcons[r.type] || Shield;
                  const isAvailable = r.status === "available";
                  const isBusy = r.status === "busy";

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={`cursor-pointer transition hover:bg-slate-50/80 ${
                        isSelected ? "bg-emerald-50/70" : ""
                      }`}
                    >
                      <td className="py-3 pr-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-white">
                            {r.unitCode}
                          </span>
                          <span className="font-semibold text-slate-800">{r.displayName}</span>
                        </div>
                      </td>

                      <td className="py-3 pr-4 text-slate-600">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 capitalize">
                          <TypeIcon className="h-3 w-3 text-slate-500" />
                          {r.type.replaceAll("_", " ")}
                        </span>
                      </td>

                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${
                            isAvailable
                              ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20"
                              : isBusy
                                ? "bg-amber-100 text-amber-800 ring-1 ring-amber-600/20"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isAvailable ? "bg-emerald-600 animate-pulse" : isBusy ? "bg-amber-600" : "bg-slate-400"
                            }`}
                          />
                          {r.status.replaceAll("_", " ")}
                        </span>
                      </td>

                      <td className="py-3 pr-4 text-slate-600">
                        {r.lastLocation && r.shareLocation ? (
                          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-700">
                            <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>{formatCoordinates(r.lastLocation.lat, r.lastLocation.lng)}</span>
                            {r.lastLocationAt ? (
                              <span className="text-slate-400 font-sans">
                                · {formatRelative(r.lastLocationAt)}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No GPS signal</span>
                        )}
                      </td>

                      <td className="py-3 font-medium text-slate-600">
                        {r.currentJob ? (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            {r.currentJob}
                          </span>
                        ) : (
                          <span className="text-slate-400">Idle / Unassigned</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <Radio className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-700">No matching responders found</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Ensure responder accounts are approved by Admin
            </p>
          </div>
        )}
      </div>
    </CommandShell>
  );
}

function Tile({
  n,
  l,
  sub,
  icon: Icon,
  color = "emerald",
}: {
  n: number;
  l: string;
  sub: string;
  icon: React.ElementType;
  color?: "emerald" | "blue" | "amber" | "slate";
}) {
  const styles = {
    emerald: "from-emerald-500/10 to-teal-500/5 text-emerald-700 border-emerald-200/60",
    blue: "from-blue-500/10 to-indigo-500/5 text-blue-700 border-blue-200/60",
    amber: "from-amber-500/10 to-orange-500/5 text-amber-700 border-amber-200/60",
    slate: "from-slate-500/10 to-slate-500/5 text-slate-700 border-slate-200/60",
  }[color];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-500">{l}</p>
        <div className={`rounded-xl border bg-gradient-to-br p-2 ${styles}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 font-display text-2xl font-black tracking-tight text-slate-900">{n}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-400">{sub}</p>
    </div>
  );
}
