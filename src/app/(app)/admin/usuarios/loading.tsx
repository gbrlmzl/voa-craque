import { SkeletonChipList, SkeletonPageHeader, SkeletonScreen } from "@/components/Skeleton";

export default function UsersLoading() {
  return (
    <SkeletonScreen className="grid gap-4">
      <SkeletonPageHeader subtitle />
      <SkeletonChipList rows={6} />
    </SkeletonScreen>
  );
}
