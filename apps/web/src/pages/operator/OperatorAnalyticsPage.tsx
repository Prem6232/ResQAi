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
  mockApi,
  type CategoryBreakdownItem,
  type HotspotFeature,
} from "@/lib/mock-api";

export function OperatorAnalyticsPage() {
  const [hotspots, setHotspots] = useState<HotspotFeature[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdownItem[]>([]);
  const [timeline, setTimeline] = useState<Array<{ date: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      mockApi.analyticsHotspots(),
      mockApi.analyticsByCategory(),
      mockApi.analyticsResponseTimes(),
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
    <CommandShell mode="operator" title="Geospatial Analytics">
      <p className="mb-4 text-xs text-ink-700/50">
        Live historical report density from backend analytics. This is not a predictive crime map. More
        reports does not mean an area is more dangerous.
      </p>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7 rounded-3xl bg-white p-3 shadow-card">
          <h2 className="mb-2 px-2 text-sm font-semibold">
            Operational incident distribution ({hotspots.length} points)
          </h2>
          <CampusBaseMap height={360}>
            {hotspots.map((feature, idx) => {
              const [lng, lat] = feature.geometry.coordinates;
              const weight = feature.properties.weight || 1.5;
              return (
                <CircleMarker
                  key={feature.properties.incidentId || feature.properties.incident_id || idx}
                  center={[lat, lng]}
                  radius={Math.max(10, Math.round(weight * 10))}
                  pathOptions={{
                    color: feature.properties.urgency === "critical" ? "#E23B3B" : "#D97706",
                    fillOpacity: 0.25,
                  }}
                >
                  <Popup>
                    <p className="font-semibold">{feature.properties.title}</p>
                    <p className="text-xs">
                      {feature.properties.category} · {feature.properties.status}
                    </p>
                  </Popup>
                </CircleMarker>
              );
            })}
          </CampusBaseMap>
        </div>
        <div className="col-span-5 space-y-4">
          <div className="rounded-3xl bg-white p-4 shadow-card">
            <h2 className="mb-2 text-sm font-semibold">Incidents by category</h2>
            {loading ? (
              <p className="text-xs text-ink-700/50">Loading category breakdown…</p>
            ) : categories.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={categories} layout="vertical">
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0F8A7A" radius={6} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-ink-700/50">No categorized incidents recorded yet.</p>
            )}
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-card">
            <h2 className="mb-2 text-sm font-semibold">Daily incident volume</h2>
            {loading ? (
              <p className="text-xs text-ink-700/50">Loading timeline…</p>
            ) : timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#E23B3B" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-ink-700/50">No daily volume data available.</p>
            )}
          </div>
        </div>
      </div>
    </CommandShell>
  );
}
