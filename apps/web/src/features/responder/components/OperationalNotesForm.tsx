import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function OperationalNotesForm() {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(true);
      }}
    >
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Operational note" />
      <Button type="submit" variant="outline">
        Save note
      </Button>
      {saved ? <p className="text-xs text-duty-600">Note stored locally for this demo.</p> : null}
    </form>
  );
}
