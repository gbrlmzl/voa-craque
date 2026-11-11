import { SkeletonBlock, SkeletonCard, SkeletonScreen, SkeletonSectionTitle, SkeletonText } from "@/components/Skeleton";

export default function SettingsLoading() {
  return (
    <SkeletonScreen className="mx-auto grid max-w-lg gap-5">
      <SkeletonBlock className="h-8 w-48 rounded-lg" />

      <section>
        <SkeletonSectionTitle />
        <SkeletonCard className="grid gap-3">
          <SkeletonText className="w-32" />
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </SkeletonCard>
      </section>

      <section>
        <SkeletonSectionTitle />
        <SkeletonBlock className="h-12 w-36 rounded-xl" />
      </section>
    </SkeletonScreen>
  );
}
