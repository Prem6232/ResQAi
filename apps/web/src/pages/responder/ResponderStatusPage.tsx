import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export function ResponderStatusPage() {
  const [share, setShare] = useState(true);
  const [sound, setSound] = useState(true);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold">Status</h1>
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <p className="text-xs text-ink-700/50">Fire unit F-2 · Station 3 · synthetic</p>
        <p className="mt-1 font-display text-xl font-bold">Rohit Nair</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className="bg-amber-50 text-amber-800">Busy</Badge>
          <Badge className="bg-duty-50 text-duty-600">On duty</Badge>
        </div>
      </div>
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <p className="text-sm font-semibold">Skills and equipment</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge className="bg-paper-100">Firefighting</Badge>
          <Badge className="bg-paper-100">Rescue</Badge>
          <Badge className="bg-paper-100">Hazard</Badge>
        </div>
      </div>
      <div className="space-y-3 rounded-3xl bg-white p-4 shadow-card">
        <label className="flex items-center justify-between text-sm">
          Share live location
          <Switch checked={share} onCheckedChange={setShare} />
        </label>
        <label className="flex items-center justify-between text-sm">
          Alert sound
          <Switch checked={sound} onCheckedChange={setSound} />
        </label>
      </div>
    </div>
  );
}
