import { SkeletonBackLink, SkeletonBlock, SkeletonScoreboard, SkeletonScreen } from "@/components/Skeleton";

/** Painel ao vivo: placar e os botoes grandes de controle da partida. */
export default function LivePanelLoading() {
  return (
    <SkeletonScreen className="grid gap-3">
      <SkeletonBackLink />
      <div className="grid gap-2 pt-1">
        <SkeletonScoreboard />
        <SkeletonBlock className="h-14 w-full rounded-2xl" />
      </div>
    </SkeletonScreen>
  );
}
