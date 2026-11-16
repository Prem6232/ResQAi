import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { mockApi } from "@/lib/mock-api";
import { useState } from "react";

export function OperationalNotesForm({
  assignmentId,
  onSaved,
}: {
  assignmentId: string;
  onSaved?: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!note.trim()) return;
        setSaving(true);
        setSaved(false);
        setError(null);
        try {
          await mockApi.appendAssignmentNotes(assignmentId, note.trim());
          setNote("");
          setSaved(true);
          onSaved?.();
        } catch {
          setError("Could not save operational note.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Append field operational note…"
      />
      <Button type="submit" variant="outline" disabled={!note.trim() || saving}>
        {saving ? "Saving…" : "Save note"}
      </Button>
      {saved ? <p className="text-xs text-duty-600">Operational note saved to mission log.</p> : null}
      {error ? <p className="text-xs text-sos-600">{error}</p> : null}
    </form>
  );
}
