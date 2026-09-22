import type { ReactNode } from "react";
import { cn } from "@/components/ui";

/**
 * Primitivas de carregamento. Sem "use client": servem aos loading.tsx (Server
 * Components) sem mandar JS ao navegador, e aos fallbacks de Suspense do cliente.
 *
 * Regra de ouro: a mesma medida do conteudo real. Skeleton de outro tamanho
 * troca a tela parada por um salto de layout, que e igualmente ruim.
 */

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block animate-pulse rounded-xl bg-white/[0.06] motion-reduce:animate-none", className)}
    />
  );
}

/** Uma linha de texto: a altura e a do line-height da classe que ela imita. */
export function SkeletonText({ className }: { className?: string }) {
  return <SkeletonBlock className={cn("h-4 rounded-md", className)} />;
}

/** Anuncia "Carregando" uma vez ao leitor de tela, em vez de dezenas de blocos vazios. */
export function SkeletonScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">Carregando…</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

/** Mesmas bordas, fundo e respiro do <Card>. */
export function SkeletonCard({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-white/10 bg-night-900/80 p-4", className)}>{children}</div>;
}

/** h1 text-2xl (linha de 2rem) com o subtitulo text-sm opcional logo abaixo. */
export function SkeletonPageHeader({ subtitle = false, className }: { subtitle?: boolean; className?: string }) {
  return (
    <div className={className}>
      <SkeletonBlock className="h-8 w-48 rounded-lg" />
      {subtitle ? <SkeletonText className="mt-2 h-4 w-80 max-w-full" /> : null}
    </div>
  );
}

/** O <Button variant="ghost" size="sm"> de "voltar para a pelada". */
export function SkeletonBackLink() {
  return <SkeletonBlock className="h-9 w-44 rounded-lg" />;
}

/** <SectionTitle>: text-sm (linha de 1.25rem) com mb-3. */
export function SkeletonSectionTitle({ className }: { className?: string }) {
  return <SkeletonText className={cn("mb-3 h-5 w-32", className)} />;
}

/** Card de lista: titulo, duas linhas de detalhe e uma linha de rodape. */
export function SkeletonListCard() {
  return (
    <SkeletonCard>
      <div className="flex items-start justify-between gap-3">
        <div className="grid flex-1 gap-2">
          <SkeletonText className="h-5 w-2/3" />
          <SkeletonText className="w-40" />
          <SkeletonText className="w-32" />
        </div>
        <SkeletonBlock className="h-5 w-16 rounded-full" />
      </div>
      <SkeletonText className="mt-3 h-3 w-48" />
    </SkeletonCard>
  );
}

/** O <Scoreboard>: cabecalho text-xs, nome do time text-sm e placar text-5xl. */
export function SkeletonScoreboard() {
  return (
    <SkeletonCard className="bg-night-900">
      <div className="mb-3 flex justify-between">
        <SkeletonText className="h-4 w-16" />
        <SkeletonText className="h-4 w-14" />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="grid justify-items-center gap-1">
            <SkeletonText className="h-5 w-16" />
            <SkeletonBlock className={slot === 1 ? "h-8 w-16" : "h-12 w-12"} />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

/** Linhas de <PlayerChip>: avatar sm (h-9) + nome e subtitulo. */
export function SkeletonChipList({ rows }: { rows: number }) {
  return (
    <SkeletonCard className="grid gap-1 p-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2.5 px-1.5 py-1">
          <SkeletonBlock className="h-9 w-9 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <SkeletonText className="w-40" />
            <SkeletonText className="h-3 w-24" />
          </div>
        </div>
      ))}
    </SkeletonCard>
  );
}

/** Formulario em card: rotulo text-sm + input h-12, repetido. */
export function SkeletonForm({ fields }: { fields: number }) {
  return (
    <SkeletonCard className="grid gap-4">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index}>
          <SkeletonText className="mb-1.5 h-5 w-28" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
      ))}
      <SkeletonBlock className="h-14 w-full rounded-2xl" />
    </SkeletonCard>
  );
}
