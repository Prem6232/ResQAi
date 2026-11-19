import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function HealthIndicator() {
  const q = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 30_000,
  });
  const ok = q.data?.status === "ok" || q.data?.status === "healthy";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-700/60">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-duty-500" : "bg-amber-500"}`} />
      {ok ? "Live API connected" : q.isError ? "Health check failed" : "Checking…"}
    </span>
  );
}
