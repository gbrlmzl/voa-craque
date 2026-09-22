import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonScreen,
  SkeletonSectionTitle,
  SkeletonText,
} from "@/components/Skeleton";

/** Inicio: saudacao, card da proxima pelada e "Seus numeros". */
export default function HomeLoading() {
  return (
    <SkeletonScreen className="grid gap-6">
      <div className="grid gap-1">
        <SkeletonText className="h-5 w-12" />
        <SkeletonBlock className="h-8 w-40 rounded-lg" />
      </div>

      <section>
        <SkeletonSectionTitle />
        <SkeletonCard className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 gap-2">
              <SkeletonText className="h-7 w-52" />
              <SkeletonText className="h-5 w-44" />
              <SkeletonText className="h-5 w-36" />
            </div>
            <SkeletonBlock className="h-5 w-20 rounded-full" />
          </div>
          <SkeletonText className="h-5 w-56" />
          <SkeletonBlock className="h-14 w-full rounded-2xl" />
        </SkeletonCard>
      </section>

      <section>
        <SkeletonSectionTitle />
        <SkeletonCard>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="grid justify-items-center gap-1">
                <SkeletonBlock className="h-8 w-8 rounded-lg" />
                <SkeletonText className="h-4 w-14" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="mt-4 h-11 w-full" />
        </SkeletonCard>
      </section>
    </SkeletonScreen>
  );
}
