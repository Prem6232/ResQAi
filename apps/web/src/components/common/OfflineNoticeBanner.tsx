import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineNoticeBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="bg-ink-900 px-3 py-2 text-center text-xs font-medium text-white">
      You are offline. Drafts can be saved on this device — they are not yet delivered.
    </div>
  );
}
