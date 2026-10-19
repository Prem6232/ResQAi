import type { Report } from "@/types/report";
import { StatusIndicator } from "@/components/common/StatusIndicator";

export function OwnReportReceipt({ report }: { report: Report }) {
  const delivered = report.deliveryState === "received_by_server";
  return (
    <div className="rounded-3xl bg-white p-5 shadow-card">
      <StatusIndicator
        label={delivered ? "Received by server" : "Saved on this device — not yet delivered"}
        tone={delivered ? "ok" : "warn"}
      />
      <h2 className="mt-3 font-display text-xl font-bold">Report {report.id.slice(0, 10)}</h2>
      <p className="mt-2 text-sm text-ink-700/70">{report.text || "SOS without additional text"}</p>
      <p className="mt-3 text-xs text-ink-700/50">{report.locationLabel}</p>
    </div>
  );
}
