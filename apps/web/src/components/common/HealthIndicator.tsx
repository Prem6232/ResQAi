import { useQuery } from "@tanstack/react-query";
import { mockApi } from "@/lib/mock-api";

export function HealthIndicator() {
  const q = useQuery({
    queryKey: ["health"],
    queryFn: () => mockApi.health(),
    refetchInterval: 30_000,
  });
  const ok = q.data?.status === "ok";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-700/60">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-duty-500" : "bg-amber-500"}`} />
      {ok ? "API mock healthy" : q.isError ? "Health check failed" : "Checking…"}
    </span>
  );
}
