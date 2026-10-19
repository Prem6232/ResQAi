import { NavLink } from "react-router-dom";
import { Bell, FileText, Home, Users, Radio, Compass, Clock, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/config/routes.config";

const citizen = [
  { to: routes.citizen.home, label: "Home", icon: Home },
  { to: routes.citizen.alerts, label: "Alerts", icon: Bell },
  { to: routes.citizen.reports, label: "My reports", icon: FileText },
  { to: routes.citizen.contacts, label: "Contacts", icon: Users },
];

const responder = [
  { to: routes.responder.feed, label: "Feed", icon: Radio },
  { to: routes.responder.active, label: "Active", icon: Compass },
  { to: routes.responder.history, label: "History", icon: Clock },
  { to: routes.responder.status, label: "Status", icon: UserRound },
];

export function BottomNavMobile({ variant }: { variant: "citizen" | "responder" }) {
  const items = variant === "citizen" ? citizen : responder;
  const active = variant === "citizen" ? "text-sos-500" : "text-duty-600";
  return (
    <nav className="sticky bottom-0 z-30 border-t border-black/5 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <ul className="grid grid-cols-4">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to.split("/").length <= 2}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-1 text-[11px] font-medium text-ink-700/45",
                  isActive && active,
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
