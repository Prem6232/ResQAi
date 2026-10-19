import type { ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ children }: { children: ReactNode }) {
  return (
    <SelectPrimitive.Trigger className="flex h-11 w-full items-center justify-between rounded-2xl border border-black/10 bg-white px-4 text-sm">
      {children}
      <ChevronDown className="h-4 w-4 opacity-60" />
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ children }: { children: ReactNode }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className="z-50 overflow-hidden rounded-2xl border bg-white shadow-card">
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="relative flex cursor-pointer items-center rounded-xl px-8 py-2 text-sm outline-none hover:bg-paper-100"
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2">
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
