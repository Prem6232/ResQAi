import { MobileHeader } from "@/components/common/Header";
import { SOSQuickButton } from "@/features/citizen/components/SOSQuickButton";
import { categoryMeta } from "@/lib/categories";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import type { IncidentCategory } from "@/types/incident";
import { useAuth } from "@/hooks/useAuth";
import { Flame, Car, HeartPulse, Shield, HelpCircle } from "lucide-react";

const icons: Record<IncidentCategory, typeof Flame> = {
  fire_smoke: Flame,
  road_accident: Car,
  medical: HeartPulse,
  personal_safety: Shield,
  other: HelpCircle,
};

export function CitizenDashboard() {
  const { user } = useAuth();
  return (
    <div>
      <MobileHeader
        role="Citizen"
        right={<span className="text-[11px] text-duty-600">Live location off</span>}
      />
      <SOSQuickButton />
      <h2 className="mb-3 mt-10 text-sm font-semibold text-ink-800">Report incident</h2>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(categoryMeta) as IncidentCategory[]).map((key) => {
          const Icon = icons[key];
          return (
            <Link
              key={key}
              to={`${routes.citizen.newReport}?category=${key}`}
              className="flex items-center gap-3 rounded-2xl bg-white px-3 py-4 text-sm font-medium shadow-card"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-paper-100 text-sos-500">
                <Icon className="h-4 w-4" />
              </span>
              {categoryMeta[key].label}
            </Link>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-ink-700/40">Signed in as {user?.name}</p>
    </div>
  );
}
