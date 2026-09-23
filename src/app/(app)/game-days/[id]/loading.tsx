import {
  SkeletonBlock,
  SkeletonChipList,
  SkeletonScreen,
  SkeletonSectionTitle,
  SkeletonText,
} from "@/components/Skeleton";

/** Pelada: cabecalho com data, local e regras, botao principal e a lista de quem vai. */
export default function GameDayLoading() {
  return (
    <SkeletonScreen className="grid gap-6">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="grid flex-1 gap-2">
            <SkeletonBlock className="h-8 w-56 rounded-lg" />
            <SkeletonText className="h-5 w-44" />
            <SkeletonText className="h-5 w-36" />
          </div>
          <SkeletonBlock className="h-5 w-20 rounded-full" />
        </div>
        <SkeletonText className="mt-3 h-4 w-72 max-w-full" />
      </header>

      <SkeletonBlock className="h-14 w-full rounded-2xl" />

      <section>
        <SkeletonSectionTitle />
        <SkeletonChipList rows={4} />
      </section>
    </SkeletonScreen>
  );
}
