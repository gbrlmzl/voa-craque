import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

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

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("rounded-2xl border border-white/10 bg-night-900/80 p-4 shadow-lg shadow-black/20", className)}
    />
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">{children}</h2>
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-white/8 text-slate-300 border-white/10",
  good: "bg-pitch-500/15 text-pitch-300 border-pitch-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  bad: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
} as const;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof BADGE_TONES }) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-rose-400">{error}</span> : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded-xl border border-white/10 bg-night-800 px-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-pitch-500/60 focus:outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(CONTROL, "h-12", className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(CONTROL, "min-h-24 py-3", className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(CONTROL, "h-12 appearance-none pr-8", className)} />;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}
