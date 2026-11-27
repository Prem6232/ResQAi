import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { api } from "@/lib/api";
import { sendLocationPing } from "@/features/responder/api/sendLocationPing";
import type { SessionUser } from "@/types/auth";
import type { ResponderCapability } from "@/types/responder";

const CAPABILITY_LABELS: Record<string, string> = {
  first_aid: "First Aid",
  firefighting: "Firefighting",
  rescue: "Rescue",
  hazard: "Hazard Response",
  security_patrol: "Security Patrol",
};

function readSoundPreference(): boolean {
  try {
    return localStorage.getItem("sg.responder.sound") !== "false";
  } catch {
    return true;
  }
}

export function ResponderStatusPage() {
  const { user } = useAuth();
  const geo = useGeolocation();
  const [profile, setProfile] = useState<SessionUser | null>(user);
  const [unitCode, setUnitCode] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ResponderCapability[]>([]);
  const [onDuty, setOnDuty] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [share, setShare] = useState(true);
  const [sound, setSound] = useState(readSoundPreference);
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then(setProfile)
      .catch(() => undefined);
    api.responderProfile().then((respProf) => {
      if (!respProf) return;
      setUnitCode(respProf.unitCode);
      setCapabilities(respProf.capabilities);
      setOnDuty(respProf.isOnDuty);
      setShare(respProf.shareLocation);
      setIsBusy(respProf.availabilityStatus === "busy");
    });
    api.assignments().then((asgs) => {
      if (asgs.some((a) => a.status === "accepted" || a.status === "en_route" || a.status === "arrived")) {
        setIsBusy(true);
      }
    });
  }, []);

  const handleToggleDuty = async (next: boolean) => {
    const prev = onDuty;
    setOnDuty(next);
    setStatusError(null);
    try {
      await api.updateDuty(next);
    } catch {
      setOnDuty(prev);
      setStatusError("Unable to update duty status.");
    }
  };

  const handleLocationPing = async () => {
    setPingStatus("Updating coordinates…");
    setStatusError(null);
    const fresh = await geo.request();
    const coords = fresh ?? geo.point;
    try {
      await sendLocationPing(coords);
      setPingStatus(`Location ping synced (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    } catch {
      setPingStatus(null);
      setStatusError("Could not send location ping.");
    }
  };

  const handleToggleShare = async (next: boolean) => {
    setShare(next);
    if (next) {
      await handleLocationPing();
    } else {
      setPingStatus("Live location sharing paused.");
    }
  };

  const handleToggleSound = (next: boolean) => {
    setSound(next);
    try {
      localStorage.setItem("sg.responder.sound", String(next));
    } catch {
      // ignore storage errors
    }
  };

  const displayName = profile?.name || user?.name || "Responder";
  const campusName = profile?.campusName || user?.campusName || "Bhopal Operations";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold">Status</h1>
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <p className="text-xs text-ink-700/50">
          {campusName} · {profile?.email || user?.email}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="font-display text-xl font-bold">{displayName}</p>
          {unitCode ? <Badge className="bg-command-50 text-command-600">{unitCode}</Badge> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className={isBusy ? "bg-amber-50 text-amber-800" : "bg-duty-50 text-duty-600"}>
            {isBusy ? "Busy on mission" : "Available"}
          </Badge>
          <Badge className={onDuty ? "bg-duty-50 text-duty-600" : "bg-paper-100 text-ink-700/70"}>
            {onDuty ? "On duty" : "Off duty"}
          </Badge>
        </div>
      </div>
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <p className="text-sm font-semibold">Capabilities</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {capabilities.length > 0 ? (
            capabilities.map((cap) => (
              <Badge key={cap} className="bg-paper-100">
                {CAPABILITY_LABELS[cap] ?? cap.replaceAll("_", " ")}
              </Badge>
            ))
          ) : (
            <>
              <Badge className="bg-paper-100">Emergency Response</Badge>
              <Badge className="bg-paper-100">Field Triage</Badge>
              <Badge className="bg-paper-100">Campus Dispatch</Badge>
            </>
          )}
        </div>
      </div>
      <div className="space-y-3 rounded-3xl bg-white p-4 shadow-card">
        <label className="flex items-center justify-between text-sm">
          On duty
          <Switch checked={onDuty} onCheckedChange={handleToggleDuty} />
        </label>
        <label className="flex items-center justify-between text-sm">
          Share live location
          <Switch checked={share} onCheckedChange={handleToggleShare} />
        </label>
        <label className="flex items-center justify-between text-sm">
          Alert sound
          <Switch checked={sound} onCheckedChange={handleToggleSound} />
        </label>
        {share ? (
          <Button type="button" variant="outline" size="sm" onClick={handleLocationPing}>
            Send GPS Ping Now
          </Button>
        ) : null}
        {pingStatus ? <p className="text-xs text-duty-600">{pingStatus}</p> : null}
        {statusError ? <p className="text-xs text-sos-600">{statusError}</p> : null}
        {geo.error ? <p className="text-xs text-amber-700">{geo.error}</p> : null}
      </div>
    </div>
  );
}
