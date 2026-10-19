import { useState } from "react";
import { StepCategoryDetails } from "./StepCategoryDetails";
import { StepMediaUpload } from "./StepMediaUpload";
import { StepLocationConfirm } from "./StepLocationConfirm";
import { Button } from "@/components/ui/button";
import type { IncidentCategory } from "@/types/incident";
import { useSubmitSOS } from "../hooks/useSubmitSOS";
import { useNavigate } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { mapConfig } from "@/config/map.config";

export function ReportIncidentWizard({ initialCategory }: { initialCategory?: IncidentCategory }) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<IncidentCategory>(initialCategory ?? "other");
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const submit = useSubmitSOS();
  const nav = useNavigate();

  const steps = ["Details", "Media", "Location"];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-700/40">
        Step {step + 1} of 3 · {steps[step]}
      </p>
      <div className="mt-4">
        {step === 0 ? (
          <StepCategoryDetails category={category} text={text} onCategory={setCategory} onText={setText} />
        ) : null}
        {step === 1 ? <StepMediaUpload /> : null}
        {step === 2 ? <StepLocationConfirm label={label} onLabel={setLabel} /> : null}
      </div>
      <div className="mt-6 flex gap-2">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        ) : null}
        {step < 2 ? (
          <Button className="flex-1" onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button
            className="flex-1"
            disabled={submit.isPending}
            onClick={async () => {
              const result = await submit.mutateAsync({
                category,
                text,
                location: {
                  lat: mapConfig.campusCenter.lat,
                  lng: mapConfig.campusCenter.lng,
                  source: "manual_map",
                },
                locationLabel: label || "Campus location (manual)",
                channel: "form",
              });
              if (result.queued) nav(routes.citizen.reports);
              else nav(routes.citizen.report(result.report.id));
            }}
          >
            Submit report
          </Button>
        )}
      </div>
    </div>
  );
}
