import { useMediaUploader } from "../hooks/useMediaUploader";
import { Button } from "@/components/ui/button";

export function StepMediaUpload() {
  const { files, add, remove } = useMediaUploader();
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700/70">
        Photos, a short video, or voice are optional. SOS is never blocked because media is missing.
      </p>
      <input
        type="file"
        accept="image/*,audio/*,video/*"
        multiple
        onChange={(e) => add(e.target.files)}
      />
      <ul className="space-y-2">
        {files.map((f) => (
          <li key={f.name} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm">
            {f.name}
            <Button size="sm" variant="ghost" onClick={() => remove(f.name)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
