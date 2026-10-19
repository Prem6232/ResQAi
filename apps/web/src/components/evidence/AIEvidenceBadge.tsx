import { Badge } from "@/components/ui/badge";
import type { EvidenceLabel } from "@/types/common";

const labels: Record<EvidenceLabel, string> = {
  unverified: "Unverified",
  insufficient_evidence: "Insufficient evidence",
  possible_duplicate: "Possible duplicate",
  conflicting_evidence: "Conflicting evidence",
  confirmed_by_operator: "Confirmed by operator",
  false_or_malicious_after_review: "False after documented review",
};

export function AIEvidenceBadge({ label }: { label: EvidenceLabel }) {
  return <Badge className="bg-slate-100 text-slate-700">{labels[label]}</Badge>;
}
