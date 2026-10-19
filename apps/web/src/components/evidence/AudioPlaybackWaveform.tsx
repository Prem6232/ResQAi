export function AudioPlaybackWaveform({ src }: { src?: string }) {
  if (!src) {
    return <p className="text-sm text-ink-700/50">No audio attached.</p>;
  }
  return <audio controls src={src} className="w-full" />;
}
