import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { CONTROL } from "@/components/ui/controlStyles";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(CONTROL, "h-12 appearance-none pr-8", className)} />;
}
