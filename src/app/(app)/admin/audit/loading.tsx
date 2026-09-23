import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonScreen,
  SkeletonText,
} from "@/components/Skeleton";

export default function AuditLoading() {
  return (
    <SkeletonScreen className="grid gap-4">
      <SkeletonPageHeader subtitle />
      <SkeletonCard className="grid gap-3 sm:grid-cols-5">
        <SkeletonBlock className="h-12 w-full sm:col-span-2" />
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-12 w-full sm:col-span-2" />
      </SkeletonCard>
      <div className="grid gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} className="grid gap-2 p-3">
            <SkeletonText className="w-48" />
            <SkeletonText className="h-3 w-32" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonScreen>
  );
}
