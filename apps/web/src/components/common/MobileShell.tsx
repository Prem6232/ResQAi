import type { ReactNode } from "react";
import { DisclaimerBanner } from "./DisclaimerBanner";
import { OfflineNoticeBanner } from "./OfflineNoticeBanner";
import { BottomNavMobile } from "./BottomNavMobile";

export function MobileShell({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "citizen" | "responder";
}) {
  return (
    <div className="min-h-dvh bg-[#ece7dc]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper-100 shadow-card">
        <DisclaimerBanner compact />
        <OfflineNoticeBanner />
        <div className="flex-1 px-4 pb-4 pt-3">{children}</div>
        <BottomNavMobile variant={variant} />
      </div>
    </div>
  );
}
