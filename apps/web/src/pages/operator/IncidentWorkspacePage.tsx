import { CommandShell } from "@/components/common/CommandShell";
import { IncidentDetailSheet } from "@/features/operator/components/IncidentDetailSheet";
import { api, type IncidentDetail } from "@/lib/api";
import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";

export function IncidentWorkspacePage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        if (id) {
          const d = await api.incidentDetail(id);
          if (active && d) {
            setDetail(d);
            return;
          }
        }
        const list = await api.incidents();
        if (active && list.length > 0) {
          const fallbackDetail = await api.incidentDetail(list[0].id);
          if (active) setDetail(fallbackDetail);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <CommandShell mode="operator" title={`Incident ${detail?.incident.publicCode || ""}`}>
      <div className="max-w-2xl rounded-3xl bg-white p-6 shadow-card">
        {loading ? (
          <p className="text-sm text-ink-700/50">Loading incident details...</p>
        ) : detail ? (
          <IncidentDetailSheet incident={detail.incident} detail={detail} />
        ) : (
          <p className="text-sm text-ink-700/50">Incident not found.</p>
        )}
      </div>
    </CommandShell>
  );
}
