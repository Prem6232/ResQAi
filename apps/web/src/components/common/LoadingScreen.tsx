export function LoadingScreen({ label = "Loading SENTINELGRID" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper-100">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-ink-900" />
        <p className="mt-4 text-sm text-ink-700/70">{label}</p>
      </div>
    </div>
  );
}
