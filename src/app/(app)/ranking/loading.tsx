import { SkeletonCard, SkeletonPageHeader, SkeletonScreen, SkeletonText } from "@/components/Skeleton";

export default function RankingLoading() {
  return (
    <SkeletonScreen className="grid gap-4">
      <SkeletonPageHeader subtitle />
      <SkeletonCard className="grid gap-3 p-3">
        <SkeletonText className="h-4 w-full" />
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonText key={index} className="h-6 w-full" />
        ))}
      </SkeletonCard>
    </SkeletonScreen>
  );
}
