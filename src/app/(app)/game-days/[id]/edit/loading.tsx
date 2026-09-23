import { SkeletonBlock, SkeletonForm, SkeletonScreen } from "@/components/Skeleton";

export default function EditGameDayLoading() {
  return (
    <SkeletonScreen className="mx-auto max-w-lg">
      <SkeletonBlock className="mb-4 h-8 w-44 rounded-lg" />
      <SkeletonForm fields={5} />
    </SkeletonScreen>
  );
}
