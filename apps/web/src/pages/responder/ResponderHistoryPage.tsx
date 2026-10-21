import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";
import type { Incident } from "@/types/incident";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { formatRelative } from "@/lib/utils";

export function ResponderHistoryPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    mockApi.incidents().then(setIncidents);
  }, []);

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">History</h1>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat n={String(incidents.length)} l="Total Incidents" />
        <Stat n="4.3m" l="Avg arrival" />
        <Stat n="100%" l="Accept rate" />
      </div>
      <div className="mt-4 space-y-2">
        {incidents.map((inc) => (
          <div key={inc.id} className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-card">
            <div>
              <p className="font-medium">{inc.title}</p>
              <p className="text-xs text-ink-700/50">{formatRelative(inc.updatedAt)}</p>
            </div>
            <StatusIndicator label={inc.status.replaceAll("_", " ")} tone="neutral" />
          </div>
        ))}
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
