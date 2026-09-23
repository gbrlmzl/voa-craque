import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { CONTROL } from "@/components/ui/controlStyles";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(CONTROL, "min-h-24 py-3", className)} />;
}
