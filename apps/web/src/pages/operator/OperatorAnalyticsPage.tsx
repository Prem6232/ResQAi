import { CommandShell } from "@/components/common/CommandShell";
import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { CircleMarker } from "react-leaflet";
import { mapConfig } from "@/config/map.config";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Line, LineChart, CartesianGrid } from "recharts";

const cats = [
  { name: "Medical", n: 18 },
  { name: "Accident", n: 14 },
  { name: "Fire", n: 9 },
  { name: "Other", n: 6 },
];
const volume = [
  { d: "Mon", n: 4 },
  { d: "Tue", n: 6 },
  { d: "Wed", n: 5 },
  { d: "Thu", n: 8 },
  { d: "Fri", n: 7 },
];

export function OperatorAnalyticsPage() {
  return (
    <CommandShell mode="operator" title="Geospatial Analytics">
      <p className="mb-4 text-xs text-ink-700/50">
        Historical report density from synthetic drill data. This is not a predictive crime map. More
        reports does not mean an area is more dangerous.
      </p>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7 rounded-3xl bg-white p-3 shadow-card">
          <h2 className="mb-2 px-2 text-sm font-semibold">Operational incident distribution</h2>
          <CampusBaseMap height={360}>
            <CircleMarker
              center={[mapConfig.campusCenter.lat + 0.001, mapConfig.campusCenter.lng]}
              radius={40}
              pathOptions={{ color: "#E23B3B", fillOpacity: 0.2 }}
            />
          </CampusBaseMap>
        </div>
        <div className="col-span-5 space-y-4">
          <div className="rounded-3xl bg-white p-4 shadow-card">
            <h2 className="mb-2 text-sm font-semibold">Incidents by category</h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={cats} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={80} />
                <Bar dataKey="n" fill="#0F8A7A" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-card">
            <h2 className="mb-2 text-sm font-semibold">Daily volume (drill)</h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={volume}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="d" />
                <YAxis allowDecimals={false} />
                <Line type="monotone" dataKey="n" stroke="#E23B3B" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </CommandShell>
  );
}
