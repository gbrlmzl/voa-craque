import { SkeletonBlock, SkeletonChipList, SkeletonPageHeader, SkeletonScreen } from "@/components/Skeleton";

export default function PlayersLoading() {
  return (
    <SkeletonScreen className="grid gap-4">
      <SkeletonPageHeader subtitle />
      <div className="grid gap-3">
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonChipList rows={5} />
      </div>
    </SkeletonScreen>
  );
}
