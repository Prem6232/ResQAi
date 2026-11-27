import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSubmitSOS } from "@/features/citizen/hooks/useSubmitSOS";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useNavigate } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { Alert } from "@/components/ui/alert";

export function SOSSubmitPage() {
  const geo = useGeolocation();
  const submit = useSubmitSOS();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleSendSOS = async () => {
    setError(null);
    const coords = geo.consent && geo.point.source === "gps" ? geo.point : (await geo.request()) ?? geo.point;
    try {
      const result = await submit.mutateAsync({
        category: "personal_safety",
        text: "SOS from citizen app",
        location: coords,
        locationLabel:
          coords.source === "gps" ? "Citizen SOS GPS Location" : "Bhopal Metro SOS Location",
        channel: "sos",
      });
      if ("report" in result && result.report) nav(routes.citizen.report(result.report.id));
      else nav(routes.citizen.reports);
    } catch {
      setError("Could not send SOS signal. Check connection or dial 112 immediately.");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold">Send SOS</h1>
      <Alert>
        This notifies the Bhopal control room. It does not replace calling official emergency services.
      </Alert>
      <p className="text-sm text-ink-700/70">
        The report is saved and delivered before any AI runs. You can add details after sending.
      </p>
      <Button type="button" variant="outline" onClick={() => void geo.request()}>
        {geo.point.source === "gps" ? "GPS location locked" : "Share location with consent"}
      </Button>
      {geo.error ? <p className="text-xs text-amber-700">{geo.error}</p> : null}
      {error ? <p className="text-xs text-sos-600">{error}</p> : null}
      <Button
        className="w-full"
        disabled={submit.isPending}
        onClick={() => void handleSendSOS()}
      >
        {submit.isPending ? "Sending SOS…" : "Send SOS now"}
      </Button>
    </div>
  );
}
