import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { http } from "@/lib/axios";
import { mockApi } from "@/lib/mock-api";

export function DemoDrillModeToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    mockApi.analyticsSummary().then((sum) => {
      if (sum) setOn(sum.syntheticDrillMode);
    });
  }, []);

  const handleToggle = async (val: boolean) => {
    const prev = on;
    setOn(val);
    try {
      const res = await http.post("/admin/drill-mode", { enabled: val, drillMode: val });
      if (typeof res.data?.drillMode === "boolean") {
        setOn(res.data.drillMode);
      }
    } catch {
      setOn(prev);
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
