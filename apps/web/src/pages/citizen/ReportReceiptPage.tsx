import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMyReports } from "@/features/citizen/api/getMyReports";
import { OwnReportReceipt } from "@/features/citizen/components/OwnReportReceipt";
import { IncidentTimeline } from "@/components/coordination/IncidentTimeline";

export function ReportReceiptPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["my-reports"], queryFn: getMyReports });
  const report = q.data?.find((r) => r.id === id);
  if (q.isLoading) return <p>Loading receipt…</p>;
  if (!report) return <p>Report not found.</p>;
  return (
    <div className="space-y-4">
      <OwnReportReceipt report={report} />
      <div className="rounded-3xl bg-white p-5 shadow-card">
        <h2 className="mb-3 font-semibold">Timeline</h2>
        <IncidentTimeline
          events={[
            {
              id: "e1",
              incidentId: report.incidentId ?? report.id,
              to: "reported",
              at: report.createdAt,
              actorRole: "citizen",
              note: "Original submission preserved",
            },
          ]}
        />
      </div>
    </div>
  );
}
