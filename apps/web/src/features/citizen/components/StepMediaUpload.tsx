import { useEffect, useMemo } from "react";
import { useMediaUploader } from "../hooks/useMediaUploader";
import { Button } from "@/components/ui/button";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepMediaUpload({
  files: controlledFiles,
  onAdd,
  onRemove,
}: {
  files?: File[];
  onAdd?: (list: FileList | null) => void;
  onRemove?: (name: string) => void;
}) {
  const local = useMediaUploader();
  const files = controlledFiles ?? local.files;
  const add = onAdd ?? local.add;
  const remove = onRemove ?? local.remove;

  const previews = useMemo(
    () =>
      files.map((f) => ({
        file: f,
        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((p) => {
        if (p.url) URL.revokeObjectURL(p.url);
      });
    };
  }, [previews]);

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
        {previews.map(({ file, url }) => (
          <li key={file.name} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-sm shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              {url ? (
                <img
                  src={url}
                  alt={file.name}
                  className="h-10 w-10 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper-100 text-[10px] font-semibold uppercase text-ink-700/70">
                  {file.type.split("/")[0] || "file"}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-ink-700/50">{formatBytes(file.size)}</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(file.name)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
