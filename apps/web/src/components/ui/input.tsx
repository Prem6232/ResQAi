import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none placeholder:text-ink-700/40",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
