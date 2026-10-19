import type { ReactNode } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;

export function DropdownMenuContent({ children }: { children: ReactNode }) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content className="z-50 min-w-44 rounded-2xl border bg-white p-1 shadow-card">
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect?: () => void;
}) {
  return (
    <Dropdown.Item
      onSelect={onSelect}
      className="cursor-pointer rounded-xl px-3 py-2 text-sm outline-none hover:bg-paper-100"
    >
      {children}
    </Dropdown.Item>
  );
}
