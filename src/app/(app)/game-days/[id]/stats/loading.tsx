import { SkeletonBlock, SkeletonCard, SkeletonScreen, SkeletonText } from "@/components/Skeleton";

export default function GameDayStatsLoading() {
  return (
    <SkeletonScreen className="grid gap-4">
      <div>
        <SkeletonBlock className="h-8 w-52 rounded-lg" />
        <SkeletonText className="mt-2 w-64" />
      </div>
      <SkeletonCard className="grid gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-14 w-full rounded-xl" />
        ))}
      </SkeletonCard>
    </SkeletonScreen>
  );
}
