import type { MediaAsset } from "@/types/report";

export function MediaGalleryViewer({ assets }: { assets: MediaAsset[] }) {
  if (!assets.length) {
    return <p className="text-sm text-ink-700/50">No media. SOS is still delivered without attachments.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-2">
      {assets.map((a) => (
        <li key={a.id} className="rounded-2xl bg-slate-50 p-3 text-xs">
          {a.fileName}
          {a.demoNote ? <p className="mt-1 text-ink-700/50">{a.demoNote}</p> : null}
        </li>
      ))}
    </ul>
  );
}
