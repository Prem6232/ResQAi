import { Switch } from "@/components/ui/switch";

export function ResponderStatusToggle({
  onDuty,
  onChange,
}: {
  onDuty: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold">
      <span className={onDuty ? "text-duty-600" : "text-ink-700/50"}>{onDuty ? "ON DUTY" : "OFF DUTY"}</span>
      <Switch checked={onDuty} onCheckedChange={onChange} />
    </label>
  );
}
