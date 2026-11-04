import { cn } from "@/components/ui";

/**
 * Numero com largura fixa por caractere. `tabular-nums` so ajuda se a fonte do
 * aparelho tiver algarismos de largura igual (em muito Android com fonte trocada
 * o "1" e mais estreito que o "0"); aqui cada caractere ganha uma celula propria,
 * entao o relogio e o placar nao andam. O texto inteiro vai num span so para
 * leitor de tela (as celulas ficam escondidas, senao ele le "0, 7, dois pontos").
 */
export function FixedDigits({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("inline-flex justify-center tabular-nums", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {Array.from(value).map((char, index) => (
          <span
            key={index}
            className={cn(
              "inline-block text-center",
              char === ":" ? "w-[0.32em]" : /\d/.test(char) ? "w-[0.62em]" : null,
            )}
          >
            {char}
          </span>
        ))}
      </span>
    </span>
  );
}
