import {
  SkeletonBackLink,
  SkeletonBlock,
  SkeletonChipList,
  SkeletonScoreboard,
  SkeletonScreen,
} from "@/components/Skeleton";

export default function SpectatorLoading() {
  return (
    <SkeletonScreen className="grid gap-3">
      <div>
        <SkeletonBackLink />
        <SkeletonBlock className="mt-1 h-8 w-32 rounded-lg" />
      </div>
      <div className="grid gap-4">
        <SkeletonScoreboard />
        <SkeletonChipList rows={3} />
      </div>
    </SkeletonScreen>
  );
}
