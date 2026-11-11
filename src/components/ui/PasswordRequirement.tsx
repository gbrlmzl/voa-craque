import { cn } from "@/lib/cn";
import { CheckCircleIcon, RadioUncheckedIcon } from "@/components/ui/icons";

/** Uma linha da lista de criterios de senha: circulo vazio, vira check verde ao cumprir. */
export function PasswordRequirement({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircleIcon className="size-5 shrink-0 text-pitch-400" />
      ) : (
        <RadioUncheckedIcon className="size-5 shrink-0 text-slate-600" />
      )}
      <span className={cn("transition-colors", ok ? "text-slate-100" : "text-slate-400")}>{text}</span>
      <span className="sr-only">{ok ? "(cumprido)" : "(pendente)"}</span>
    </li>
  );
}
