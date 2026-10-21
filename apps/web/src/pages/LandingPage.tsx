import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { Button } from "@/components/ui/button";
import { HealthIndicator } from "@/components/common/HealthIndicator";
import {
  ShieldAlert,
  Radio,
  Users,
  LayoutDashboard,
  ArrowRight,
  ShieldCheck,
  Flame,
  Car,
  Droplets,
  HeartPulse,
  Activity,
  MapPin,
  Lock,
} from "lucide-react";

export function LandingPage() {
  const roles = [
    {
      role: "Citizen Portal",
      desc: "Instant personal SOS beacon, live telemetry, and community incident reports.",
      email: "citizen@campus.demo",
      to: routes.citizen.home,
      badge: "Mobile Web",
      badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
      accent: "border-t-rose-500",
      icon: ShieldAlert,
      iconColor: "text-rose-600 bg-rose-50",
    },
    {
      role: "First Responder",
      desc: "Duty shift toggle, proximity incident alerts, and GPS route guidance.",
      email: "responder@campus.demo",
      to: routes.responder.feed,
      badge: "Field Ops",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      accent: "border-t-emerald-500",
      icon: Radio,
      iconColor: "text-emerald-600 bg-emerald-50",
    },
    {
      role: "Control Room Operator",
      desc: "Live geospatial triage, automated multi-sensor analysis, and human-in-the-loop dispatch.",
      email: "operator@campus.demo",
      to: routes.operator.live,
      badge: "Command Centre",
      badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
      accent: "border-t-sky-500",
      icon: LayoutDashboard,
      iconColor: "text-sky-600 bg-sky-50",
    },
    {
      role: "System Administrator",
      desc: "Campus geofence boundaries, responder credential verification, and audit logs.",
      email: "admin@campus.demo",
      to: routes.admin.home,
      badge: "Administration",
      badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
      accent: "border-t-indigo-500",
      icon: Users,
      iconColor: "text-indigo-600 bg-indigo-50",
    },
  ];

  const categories = [
    { name: "Fire & Smoke", icon: Flame, color: "text-amber-600 bg-amber-50 border-amber-100" },
    { name: "Road Accident", icon: Car, color: "text-blue-600 bg-blue-50 border-blue-100" },
    { name: "Water & Flood", icon: Droplets, color: "text-cyan-600 bg-cyan-50 border-cyan-100" },
    { name: "Medical Urgent", icon: HeartPulse, color: "text-rose-600 bg-rose-50 border-rose-100" },
  ];

  return (
    <div className="min-h-dvh bg-[#F8FAFC] text-slate-900 selection:bg-sky-100 selection:text-sky-900">
      {/* Top Disclaimer / Environment Notice */}
      <div className="border-b border-amber-200/70 bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
          Campus Pilot Drill Environment
        </span>
        <span className="mx-2 hidden text-amber-400 sm:inline">|</span>
        <span className="text-amber-800/80">Decision-support prototype. Authorized pilots only.</span>
      </div>

      {/* Main Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ResQAI" className="h-9 w-auto object-contain" />
            <div className="hidden h-5 w-px bg-slate-200 sm:block" />
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-slate-500 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry Grid
            </span>
          </div>

          <div className="flex items-center gap-3">
            <HealthIndicator />
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link to={routes.login}>Sign in</Link>
            </Button>
            <Button asChild variant="brand" size="sm">
              <Link to={routes.register} className="flex items-center gap-1.5">
                Register <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto max-w-6xl px-5 pt-12 pb-16">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1 text-xs font-semibold text-sky-800 shadow-sm">
            <Activity className="h-3.5 w-3.5 text-sky-600 animate-pulse" />
            <span>ResQAI Emergency Coordination System</span>
          </div>

          {/* Heading */}
          <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            Report clearly. <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent">
              Assess intelligently.
            </span>{" "}
            <br className="hidden sm:block" />
            Coordinate responsibly.
          </h1>

          <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
            A cohesive emergency dispatch and citizen response platform. Citizens broadcast SOS
            beacons, field responders receive validated jobs, and human operators maintain full dispatch
            command supported by automated AI triage.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="brand" size="lg" className="h-12 px-7 text-base shadow-lg shadow-blue-500/25">
              <Link to={routes.login} className="flex items-center gap-2">
                Open Command Portal <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 border-slate-300 bg-white px-6 text-slate-700 hover:bg-slate-100">
              <Link to={routes.register}>Create citizen account</Link>
            </Button>
          </div>

          {/* Incident Quick Badges */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Supported Drills:</span>
            {categories.map((c) => (
              <span
                key={c.name}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${c.color}`}
              >
                <c.icon className="h-3.5 w-3.5" />
                {c.name}
              </span>
            ))}
          </div>
        </div>

        {/* Roles & Portals Section */}
        <section className="mt-16">
          <div className="mb-6 flex flex-col items-center justify-between gap-2 sm:flex-row">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                Interactive Portals & Roles
              </h2>
              <p className="text-sm text-slate-500">
                Select any workspace role below to explore the prototype with synthetic accounts.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              Default password: <code className="font-mono font-bold text-slate-900">demo1234</code>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((item) => (
              <div
                key={item.role}
                className={`group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-md border-t-4 ${item.accent}`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className={`rounded-xl p-2.5 ${item.iconColor}`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="mt-4 font-display text-lg font-bold text-slate-900 group-hover:text-sky-700">
                    {item.role}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.desc}</p>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="mb-3 rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
                    <p className="truncate text-slate-800 font-semibold">{item.email}</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full justify-between border-slate-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700">
                    <Link to={routes.login}>
                      <span>Sign In as {item.role.split(" ")[0]}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="mt-16 rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-display font-bold text-slate-900">Zero-Latency SOS</h4>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  One-tap concentric radar broadcast transmits GPS coordinates and emergency beacons immediately.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-display font-bold text-slate-900">AI Decision Support</h4>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Multi-modal vision and duplicate detection triage data while keeping human dispatchers in command.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                <MapPin className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-display font-bold text-slate-900">Proximity Dispatch</h4>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Verified campus responders get geofenced mission requests with 90-second response acknowledgement.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* System Footer info */}
        <footer className="mt-14 border-t border-slate-200/80 pt-6 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} ResQAI — Campus & Community Emergency Coordination Prototype.</p>
          <p className="mt-1 text-slate-400">
            Synthetic drill data only. All coordinates and incidents are mock demonstrations.
          </p>
        </footer>
      </main>
    </div>
  );
}
