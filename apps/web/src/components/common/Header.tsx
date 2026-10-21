import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export function MobileHeader({
  brand = "ResQAI",
  role,
  right,
}: {
  brand?: string;
  role: string;
  right?: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <header className="flex items-center justify-between px-1 pb-2 pt-1">
      <div className="flex items-center gap-2">
        <img src="/logo-tight.png" alt="ResQAI" className="h-7 w-auto object-contain" />
        <div>
          <p className="font-display text-lg font-extrabold tracking-tight">{brand}</p>
          <p className="text-[11px] text-ink-700/50">{user?.campusName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {right}
        <Badge className="bg-black/5 text-ink-700">{role}</Badge>
      </div>
    </header>
  );
}
