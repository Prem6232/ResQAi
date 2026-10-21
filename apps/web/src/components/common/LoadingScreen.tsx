export function LoadingScreen({ label = "Loading ResQAI" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper-100">
      <div className="flex flex-col items-center">
        <img src="/logo-tight.png" alt="ResQAI" className="h-12 w-auto animate-pulse object-contain" />
        <p className="mt-4 text-sm font-medium text-ink-700/70">{label}</p>
      </div>
    </div>
  );
}
