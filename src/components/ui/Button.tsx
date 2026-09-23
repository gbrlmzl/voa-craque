import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const BUTTON_VARIANTS = {
  primary: "bg-pitch-500 text-night-950 hover:bg-pitch-400 active:bg-pitch-600 font-semibold",
  secondary: "bg-night-700 text-slate-100 hover:bg-night-700/70 border border-white/10",
  ghost: "text-slate-300 hover:bg-white/5",
  danger: "bg-rose-600 text-white hover:bg-rose-500 font-semibold",
  outline: "border border-pitch-500/50 text-pitch-300 hover:bg-pitch-500/10",
} as const;

const BUTTON_SIZES = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-14 px-6 text-base rounded-2xl",
} as const;

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-colors select-none",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-400",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    />
  );
}
