import { CommandShell } from "@/components/common/CommandShell";
import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { CircleMarker, Popup } from "react-leaflet";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Line,
  LineChart,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useEffect, useState } from "react";
import {
  api,
  type CategoryBreakdownItem,
  type HotspotFeature,
} from "@/lib/api";
import { MapPin, BarChart3, TrendingUp } from "lucide-react";

export function OperatorAnalyticsPage() {
  const [hotspots, setHotspots] = useState<HotspotFeature[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdownItem[]>([]);
  const [timeline, setTimeline] = useState<Array<{ date: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.analyticsHotspots(),
      api.analyticsByCategory(),
      api.analyticsResponseTimes(),
    ])
      .then(([hs, cat, rt]) => {
        if (!active) return;
        setHotspots(hs.features || []);
        setCategories(cat.categories || []);
        setTimeline((rt.timeline || []).map((t) => ({ date: t.date, count: t.count })));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <CommandShell
      mode="operator"
      title="Bhopal Geospatial Analytics"
      subtitle="Spatial clustering, incident category breakdown, and historical dispatch volume"
    >
      <div className="grid grid-cols-12 gap-5">
        {/* Left Map View */}
        <div className="col-span-12 lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                Operational Incident Density ({hotspots.length} Points Tracked)
              </h2>
              <p className="text-[11px] text-slate-400">
                PostGIS spatial density within Bhopal Municipal Boundary
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              Bhopal Urban Grid
            </span>
          </div>

          <CampusBaseMap height={420}>
            {hotspots.map((feature, idx) => {
              const [lng, lat] = feature.geometry.coordinates;
              const weight = feature.properties.weight || 1.5;
              const isCritical = feature.properties.urgency === "critical";

              return (
                <CircleMarker
                  key={feature.properties.incidentId || feature.properties.incident_id || idx}
                  center={[lat, lng]}
                  radius={Math.max(12, Math.round(weight * 11))}
                  pathOptions={{
                    color: isCritical ? "#E11D48" : "#D97706",
                    fillColor: isCritical ? "#F43F5E" : "#F59E0B",
                    fillOpacity: 0.35,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="p-1 font-sans">
                      <p className="font-bold text-slate-900">{feature.properties.title}</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Category: {feature.properties.category}
                      </p>
                      <p className="text-xs text-slate-600">
                        Status: {feature.properties.status}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </CampusBaseMap>
        </div>

        {/* Right Charts View */}
        <div className="col-span-12 lg:col-span-5 space-y-5">
          {/* Incidents by Category */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <BarChart3 className="h-3.5 w-3.5 text-teal-600" />
              Incidents by Emergency Category
            </h2>
            {loading ? (
              <p className="p-4 text-xs text-slate-400">Loading category breakdown…</p>
            ) : categories.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={categories} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11, fill: "#475569" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#334155",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="count" fill="#0D9488" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="p-4 text-xs text-slate-400">No categorized incidents recorded yet.</p>
            )}
          </div>

          {/* Daily Incident Volume */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
              Daily Emergency Volume
            </h2>
            {loading ? (
              <p className="p-4 text-xs text-slate-400">Loading timeline telemetry…</p>
            ) : timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={timeline} margin={{ left: -10, right: 10, top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#334155",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#fff",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#4F46E5"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#4F46E5" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="p-4 text-xs text-slate-400">No volume telemetry recorded for period.</p>
            )}
          </div>
        </div>
      </div>
    </CommandShell>
  );
}
