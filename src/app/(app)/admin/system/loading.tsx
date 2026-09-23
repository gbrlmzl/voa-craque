import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonScreen,
  SkeletonSectionTitle,
  SkeletonText,
} from "@/components/Skeleton";

export default function SystemLoading() {
  return (
    <SkeletonScreen className="grid gap-5">
      <SkeletonPageHeader subtitle />

      <SkeletonCard className="grid gap-4">
        {[0, 1].map((slot) => (
          <div key={slot} className="flex items-center justify-between gap-4">
            <div className="grid flex-1 gap-1.5">
              <SkeletonText className="h-5 w-36" />
              <SkeletonText className="h-3 w-full max-w-xs" />
            </div>
            <SkeletonBlock className="h-7 w-12 rounded-full" />
          </div>
        ))}
        <SkeletonBlock className="h-24 w-full" />
      </SkeletonCard>

      <section>
        <SkeletonSectionTitle />
        <SkeletonCard>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((slot) => (
              <div key={slot} className="grid justify-items-center gap-1">
                <SkeletonBlock className="h-8 w-10 rounded-lg" />
                <SkeletonText className="h-4 w-14" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </section>
    </SkeletonScreen>
  );
}
