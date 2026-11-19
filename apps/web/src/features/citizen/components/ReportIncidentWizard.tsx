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
import { useMediaUploader } from "../hooks/useMediaUploader";
import { api } from "@/lib/api";
import type { GeoPoint } from "@/types/common";

export function ReportIncidentWizard({ initialCategory }: { initialCategory?: IncidentCategory }) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<IncidentCategory>(initialCategory ?? "other");
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [point, setPoint] = useState<GeoPoint>({
    lat: mapConfig.campusCenter.lat,
    lng: mapConfig.campusCenter.lng,
    source: "manual_map",
  });
  const [submitting, setSubmitting] = useState(false);
  const { files, add, remove } = useMediaUploader();
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
        {step === 1 ? <StepMediaUpload files={files} onAdd={add} onRemove={remove} /> : null}
        {step === 2 ? (
          <StepLocationConfirm label={label} onLabel={setLabel} point={point} onPoint={setPoint} />
        ) : null}
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
            disabled={submit.isPending || submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                const uploadedIds = (
                  await Promise.all(files.map((f) => api.requestMediaUpload(f)))
                ).filter((id): id is string => Boolean(id));

                const result = await submit.mutateAsync({
                  category,
                  text: text.trim() || "Incident reported from citizen portal",
                  location: point,
                  locationLabel: label || "Campus location (manual)",
                  channel: "form",
                  mediaAssetIds: uploadedIds,
                });
                if (result.queued) nav(routes.citizen.reports);
                else nav(routes.citizen.report(result.report.id));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting || submit.isPending ? "Submitting…" : "Submit report"}
          </Button>
        )}
      </div>
    </div>
  );
}
