import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonForm,
  SkeletonScreen,
  SkeletonSectionTitle,
  SkeletonText,
} from "@/components/Skeleton";

export default function ProfileLoading() {
  return (
    <SkeletonScreen className="mx-auto grid max-w-lg gap-5">
      <div className="grid gap-2">
        <SkeletonBlock className="h-8 w-48 rounded-lg" />
        <SkeletonText className="h-5 w-56" />
      </div>

      <section>
        <SkeletonSectionTitle />
        <SkeletonCard className="grid gap-3">
          <SkeletonBlock className="h-5 w-28 rounded-md" />
          <SkeletonText className="w-44" />
        </SkeletonCard>
      </section>

      <section>
        <SkeletonSectionTitle />
        <SkeletonForm fields={3} />
      </section>
    </SkeletonScreen>
  );
}
