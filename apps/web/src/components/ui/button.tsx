import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-sos-500 text-white shadow-sos hover:bg-sos-600",
        brand: "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-blue-500/25 hover:from-sky-600 hover:to-blue-700",
        duty: "bg-duty-500 text-white hover:bg-duty-600",
        command: "bg-command-500 text-white hover:bg-command-600",
        outline: "border border-ink-900/10 bg-white text-ink-800 hover:bg-paper-50",
        ghost: "text-ink-800 hover:bg-black/5",
        dark: "bg-ink-900 text-white hover:bg-ink-800",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-6",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
