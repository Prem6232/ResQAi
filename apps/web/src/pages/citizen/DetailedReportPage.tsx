import { ReportIncidentWizard } from "@/features/citizen/components/ReportIncidentWizard";
import { useSearchParams } from "react-router-dom";
import type { IncidentCategory } from "@/types/incident";

export function DetailedReportPage() {
  const [params] = useSearchParams();
  const category = params.get("category") as IncidentCategory | null;
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">New incident report</h1>
      <div className="mt-4">
        <ReportIncidentWizard initialCategory={category ?? undefined} />
      </div>
    </div>
  );
}
