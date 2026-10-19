export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
      <div className="h-full bg-sos-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
