import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function VoiceTranscriptReview({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Review transcript before submit</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-xs text-ink-700/50">
        Transcription runs on the server after delivery. This preview may be empty until then.
      </p>
      <Button type="button" variant="outline" onClick={() => onSave(text)}>
        Use this text
      </Button>
    </div>
  );
}
