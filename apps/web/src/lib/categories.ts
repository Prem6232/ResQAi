import type { IncidentCategory, IncidentStatus, Urgency } from "@/types/incident";

export const categoryMeta: Record<
  IncidentCategory,
  { label: string; short: string; icon: string }
> = {
  fire_smoke: { label: "Fire & Smoke", short: "Fire", icon: "🔥" },
  road_accident: { label: "Road accident", short: "Accident", icon: "🚗" },
  medical: { label: "Medical assistance", short: "Medical", icon: "✚" },
  personal_safety: { label: "Personal-safety SOS", short: "Safety", icon: "🛡️" },
  other: { label: "Other / uncertain", short: "Other", icon: "⚑" },
};

export const urgencyMeta: Record<Urgency, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-sos-50 text-sos-600" },
  high: { label: "High", className: "bg-orange-50 text-orange-700" },
  medium: { label: "Medium", className: "bg-amber-50 text-amber-800" },
  low: { label: "Low", className: "bg-slate-100 text-slate-600" },
};

export const incidentStatusMeta: Record<IncidentStatus, { label: string }> = {
  reported: { label: "Reported" },
  under_review: { label: "In review" },
  confirmed: { label: "Confirmed" },
  assigned: { label: "Dispatched" },
  en_route: { label: "En route" },
  on_scene: { label: "On scene" },
  resolved: { label: "Resolved" },
  closed: { label: "Closed" },
  cancelled: { label: "Cancelled" },
  duplicate: { label: "Duplicate" },
  unverified: { label: "Unverified" },
};
