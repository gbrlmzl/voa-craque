import { SkeletonListCard, SkeletonPageHeader, SkeletonScreen } from "@/components/Skeleton";

export default function GameDaysLoading() {
  return (
    <SkeletonScreen className="grid gap-4">
      <SkeletonPageHeader />
      <div className="grid gap-3">
        <SkeletonListCard />
        <SkeletonListCard />
        <SkeletonListCard />
      </div>
    </SkeletonScreen>
  );
}
