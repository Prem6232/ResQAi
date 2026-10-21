import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { http } from "@/lib/axios";

export function DemoDrillModeToggle() {
  const [on, setOn] = useState(true);

  const handleToggle = async (val: boolean) => {
    setOn(val);
    try {
      await http.post("/admin/drill-mode", { enabled: val, drillMode: val });
    } catch {
      // safe fallback
    }
  };

  return (
    <label className="flex items-center justify-between rounded-2xl bg-white p-4">
      <span>
        <span className="block font-medium">Synthetic demo / drill mode</span>
        <span className="text-xs text-ink-700/50">Labels all sample incidents as synthetic.</span>
      </span>
      <Switch checked={on} onCheckedChange={handleToggle} />
    </label>
  );
}
