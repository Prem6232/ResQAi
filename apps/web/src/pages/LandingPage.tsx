import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/common/DisclaimerBanner";
import { HealthIndicator } from "@/components/common/HealthIndicator";

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-ink-900 text-white">
      <DisclaimerBanner />
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sos-100">Campus coordination prototype</p>
        <h1 className="font-display text-5xl font-extrabold leading-tight">SENTINELGRID</h1>
        <p className="text-lg text-white/70">Report clearly. Assess intelligently. Coordinate responsibly.</p>
        <p className="max-w-xl text-sm text-white/55">
          Citizens send SOS and incident reports. Operators review evidence with human authority. Approved
          responders receive offers — never automatic dispatch into hazards they are not cleared for.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to={routes.login}>Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
            <Link to={routes.register}>Create citizen account</Link>
          </Button>
        </div>
        <HealthIndicator />
        <div className="rounded-3xl bg-white/5 p-5 text-sm text-white/70">
          Demo accounts use password <code>demo1234</code>: citizen@campus.demo, responder@campus.demo,
          operator@campus.demo, admin@campus.demo
        </div>
      </div>
    </div>
  );
}
