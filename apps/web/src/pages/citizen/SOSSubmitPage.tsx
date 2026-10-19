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

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold">Send SOS</h1>
      <Alert>
        This notifies the campus control room. It does not replace calling official emergency services.
      </Alert>
      <p className="text-sm text-ink-700/70">
        The report is saved and delivered before any AI runs. You can add details after sending.
      </p>
      <Button type="button" variant="outline" onClick={geo.request}>
        Share location with consent
      </Button>
      <Button
        className="w-full"
        disabled={submit.isPending}
        onClick={async () => {
          const result = await submit.mutateAsync({
            category: "personal_safety",
            text: "SOS from citizen app",
            location: geo.point,
            locationLabel: "Citizen SOS location",
            channel: "sos",
          });
          if ("report" in result && result.report) nav(routes.citizen.report(result.report.id));
          else nav(routes.citizen.reports);
        }}
      >
        Send SOS now
      </Button>
    </div>
  );
}
