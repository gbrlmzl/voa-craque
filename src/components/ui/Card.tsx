import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("rounded-2xl border border-white/10 bg-night-900/80 p-4 shadow-lg shadow-black/20", className)}
    />
  );
}
