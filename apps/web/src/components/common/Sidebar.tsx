import { NavLink } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Users, Map, Settings, Shield, FileSearch } from "lucide-react";

export function CommandSidebar({ mode }: { mode: "operator" | "admin" }) {
  const { user, logout } = useAuth();
  const items =
    mode === "operator"
      ? [
          { to: routes.operator.live, label: "Live Dashboard", icon: LayoutDashboard },
          { to: routes.operator.responders, label: "Responders", icon: Users },
          { to: routes.operator.analytics, label: "Geospatial Analytics", icon: Map },
          { to: routes.operator.audit, label: "Audit Log", icon: FileSearch },
          { to: routes.operator.settings, label: "System Settings", icon: Settings },
        ]
      : [
          { to: routes.admin.home, label: "Admin home", icon: LayoutDashboard },
          { to: routes.admin.responders, label: "Responder approval", icon: Users },
          { to: routes.admin.geofence, label: "Operating areas", icon: Map },
          { to: routes.admin.audit, label: "Security audit", icon: Shield },
          { to: routes.admin.analytics, label: "Analytics", icon: FileSearch },
        ];

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-black/5 bg-white">
      <div className="flex items-center gap-3 px-5 py-6">
        <img src="/logo-tight.png" alt="ResQAI" className="h-8 w-auto object-contain" />
        <div>
          <p className="font-display text-lg font-extrabold leading-tight">ResQAI</p>
          <p className="mt-0.5 text-xs text-ink-700/50">Command centre</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-ink-700/70",
                isActive && "bg-command-50 text-command-600",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 text-xs text-ink-700/60">
        <p className="font-semibold text-ink-800">{user?.name}</p>
        <p>{user?.email}</p>
        <button className="mt-3 text-sos-600" onClick={logout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
