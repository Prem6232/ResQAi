import { MobileHeader } from "@/components/common/Header";
import { trustedContactsSeed } from "@/lib/mock-store";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function CitizenContactsPage() {
  const [share, setShare] = useState(true);
  const [sms, setSms] = useState(true);
  return (
    <div>
      <MobileHeader role="Citizen" />
      <h1 className="font-display text-2xl font-extrabold">Trusted contacts</h1>
      <p className="mt-1 text-xs text-ink-700/50">They get your live location when you press SOS, if you enable sharing.</p>
      <div className="mt-4 space-y-3">
        {trustedContactsSeed.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-card">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-paper-100 text-xs font-bold">
                {c.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </span>
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-ink-700/50">{c.relation}</p>
              </div>
            </div>
            <StatusIndicator label={c.status} tone={c.status === "Active" ? "ok" : "warn"} />
          </div>
        ))}
      </div>
      <Button className="mt-4 w-full" variant="outline">
        Add contact
      </Button>
      <div className="mt-6 space-y-3 rounded-3xl bg-white p-4 shadow-card">
        <label className="flex items-center justify-between text-sm">
          Share live location
          <Switch checked={share} onCheckedChange={setShare} />
        </label>
        <label className="flex items-center justify-between text-sm">
          Notify by SMS
          <Switch checked={sms} onCheckedChange={setSms} />
        </label>
        <p className="text-xs text-ink-700/45">SMS uses a provider adapter. In demo mode it is mocked.</p>
      </div>
    </div>
  );
}
