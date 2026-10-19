import { LocationPicker } from "@/components/maps/LocationPicker";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Input } from "@/components/ui/input";

export function StepLocationConfirm({
  label,
  onLabel,
}: {
  label: string;
  onLabel: (v: string) => void;
}) {
  const geo = useGeolocation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700/70">
        Location is shared only with authorized operators and assigned responders after you confirm.
      </p>
      <Button type="button" variant="outline" onClick={geo.request}>
        Use current location (consent)
      </Button>
      {geo.error ? <p className="text-xs text-sos-600">{geo.error}</p> : null}
      {geo.point.accuracyMeters ? (
        <p className="text-xs">GPS accuracy ±{Math.round(geo.point.accuracyMeters)} m — poor accuracy does not dismiss an SOS.</p>
      ) : null}
      <LocationPicker value={geo.point} onChange={geo.setPoint} />
      <Input value={label} onChange={(e) => onLabel(e.target.value)} placeholder="Building / landmark name" />
    </div>
  );
}
