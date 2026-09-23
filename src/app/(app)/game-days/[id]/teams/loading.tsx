import {
  SkeletonBackLink,
  SkeletonBlock,
  SkeletonCard,
  SkeletonScreen,
  SkeletonText,
} from "@/components/Skeleton";

export default function TeamsLoading() {
  return (
    <SkeletonScreen className="grid gap-4">
      <div>
        <SkeletonBackLink />
        <SkeletonBlock className="mt-1 h-8 w-28 rounded-lg" />
        <SkeletonText className="mt-2 w-full max-w-md" />
        <SkeletonText className="mt-1.5 w-2/3 max-w-sm" />
      </div>
      <SkeletonCard className="grid gap-3">
        <div className="grid gap-1.5">
          <SkeletonText className="h-5 w-44" />
          <SkeletonText className="h-3 w-36" />
        </div>
        <SkeletonBlock className="h-14 w-full rounded-2xl" />
      </SkeletonCard>
    </SkeletonScreen>
  );
}
