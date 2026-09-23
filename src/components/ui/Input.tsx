import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { CONTROL } from "@/components/ui/controlStyles";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(CONTROL, "h-12", className)} />;
}
