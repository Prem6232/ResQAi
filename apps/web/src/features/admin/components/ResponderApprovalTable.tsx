import { useCallback, useEffect, useState } from "react";
import type { ResponderProfile } from "@/types/responder";
import { Button } from "@/components/ui/button";
import { approveResponder } from "../api/approveResponder";
import { getRespondersList } from "../api/getRespondersList";
import { CheckCircle2, Clock, RefreshCw, ShieldAlert, ShieldCheck, Users } from "lucide-react";

type ApprovalFilter = "all" | "pending" | "approved";

export function ResponderApprovalTable() {
  const [responders, setResponders] = useState<ResponderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApprovalFilter>("all");

  const loadResponders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getRespondersList();
      setResponders(list);
    } catch {
      setError("Failed to load responder vetting queue from /admin/responders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadResponders();
  }, [loadResponders]);

  const handleToggle = async (r: ResponderProfile) => {
    setLoadingId(r.id);
    setError(null);
    try {
      await approveResponder(r.id, !r.approved);
      await loadResponders();
    } catch {
      setError(`Failed to update approval status for ${r.unitCode}.`);
    } finally {
      setLoadingId(null);
    }
  };

  const pendingCount = responders.filter((r) => !r.approved).length;
  const approvedCount = responders.filter((r) => r.approved).length;

  const filtered = responders.filter((r) => {
    if (filter === "pending") return !r.approved;
    if (filter === "approved") return r.approved;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "all", label: `All (${responders.length})` },
              { id: "pending", label: `Pending Review (${pendingCount})` },
              { id: "approved", label: `Approved (${approvedCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                filter === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void loadResponders()}
          className="h-8 gap-1.5 rounded-lg border-slate-200 text-xs font-semibold text-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && responders.length === 0 ? (
        <div className="rounded-xl border border-slate-200/80 p-8 text-center text-xs text-slate-500">
          Loading responder vetting roster…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <Users className="mx-auto h-7 w-7 text-slate-300" />
          <p className="mt-2 text-xs font-semibold text-slate-700">
            {filter === "pending" ? "No pending responder approvals" : "No responders found"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="pb-3 pr-4">Unit</th>
                <th className="pb-3 pr-4">Personnel</th>
                <th className="pb-3 pr-4">Type & Capabilities</th>
                <th className="pb-3 pr-4">Vetting Status</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="transition hover:bg-slate-50/70">
                  <td className="py-3 pr-4 font-bold text-slate-900">
                    <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-white">
                      {r.unitCode}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-slate-900">{r.fullName || r.displayName}</p>
                    {r.email ? <p className="text-[11px] text-slate-500">{r.email}</p> : null}
                  </td>
                  <td className="py-3 pr-4">
                    <p className="font-medium capitalize text-slate-700">{r.type.replaceAll("_", " ")}</p>
                    <p className="text-[11px] text-slate-400">
                      {r.capabilities.map((c) => c.replaceAll("_", " ")).join(" · ")}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    {r.approved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-600/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-600/20">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <Button
                      size="sm"
                      variant={r.approved ? "outline" : "command"}
                      disabled={loadingId === r.id}
                      onClick={() => void handleToggle(r)}
                      className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
                    >
                      {r.approved ? (
                        <>Revoke</>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Approve
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
