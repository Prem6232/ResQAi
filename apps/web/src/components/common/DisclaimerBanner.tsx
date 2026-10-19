export function DisclaimerBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[11px] font-medium text-amber-950">
      Prototype for consented campus drills. Not a certified 112 / police / ambulance dispatch system.
      {compact ? null : " AI suggestions are not verification."}
    </div>
  );
}
