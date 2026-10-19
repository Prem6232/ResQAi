import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function SettingsPrivacyPage() {
  const { logout } = useAuth();
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold">Privacy and consent</h1>
      <p className="text-sm text-ink-700/70">
        You can request deletion of your reports subject to retention and audit policy. Precise
        personal-safety locations are not shown on public maps.
      </p>
      <Button variant="outline">Request data deletion</Button>
      <Button variant="ghost" onClick={logout}>
        Sign out
      </Button>
    </div>
  );
}
