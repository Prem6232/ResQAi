import { NavLink } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  Map,
  Settings,
  Shield,
  FileSearch,
  LogOut,
  Radio,
} from "lucide-react";

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
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* Brand Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-md shadow-emerald-600/20">
          <Radio className="h-5 w-5 text-white animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-display text-lg font-black tracking-tight text-slate-900">
              ResQAI
            </span>
            <span className="rounded bg-emerald-100 px-1 py-0.2 text-[9px] font-bold text-emerald-800">
              Bhopal
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-500">
            Emergency Dispatch Center
          </p>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 space-y-1.5 px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Operations
        </div>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all",
                isActive
                  ? "bg-slate-900 text-white shadow-sm shadow-slate-900/10"
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? "text-emerald-400" : "text-slate-400 group-hover:text-slate-700"
                  )}
                />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Operator User Card */}
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200/60">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white shadow-sm">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "OP"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-800">{user?.name || "Operator"}</p>
            <p className="truncate text-[10px] text-slate-500">{user?.email || "operator@campus.demo"}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
