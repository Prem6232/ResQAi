import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyReports } from "@/features/citizen/api/getMyReports";
import { cancelReport } from "@/features/citizen/api/cancelReport";
import { OwnReportReceipt } from "@/features/citizen/components/OwnReportReceipt";
import { IncidentTimeline } from "@/components/coordination/IncidentTimeline";
import { Button } from "@/components/ui/button";
import { mockApi } from "@/lib/mock-api";
import { useState } from "react";

export function ReportReceiptPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const singleQuery = useQuery({
    queryKey: ["citizen-report", id],
    queryFn: () => mockApi.getReport(id!),
    enabled: Boolean(id),
    retry: false,
  });

  const listQuery = useQuery({
    queryKey: ["my-reports"],
    queryFn: getMyReports,
    enabled: !singleQuery.data,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelReport(id!, "Cancelled by citizen from receipt view"),
    onSuccess: () => {
      setCancelError(null);
      void queryClient.invalidateQueries({ queryKey: ["citizen-report", id] });
      void queryClient.invalidateQueries({ queryKey: ["my-reports"] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Report cannot be cancelled once dispatched.";
      setCancelError(msg);
    },
  });

  const report = singleQuery.data ?? listQuery.data?.find((r) => r.id === id);

  if (singleQuery.isLoading && !report) return <p>Loading receipt…</p>;
  if (!report) return <p>Report not found.</p>;

  const isCancelled = report.processingState === "cancelled" || Boolean(report.cancelledReason);

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
              to: isCancelled ? "cancelled" : "reported",
              at: report.createdAt,
              actorRole: "citizen",
              note:
                report.cancelledReason ||
                `AI status: ${report.processingState.replaceAll("_", " ")}`,
            },
          ]}
        />
        {!isCancelled ? (
          <div className="mt-4 space-y-2">
            <Button
              variant="outline"
              size="sm"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel report"}
            </Button>
            {cancelError ? <p className="text-xs text-sos-600">{cancelError}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
