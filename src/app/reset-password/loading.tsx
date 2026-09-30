import { SkeletonBlock, SkeletonForm, SkeletonScreen } from "@/components/Skeleton";

export default function ResetPasswordLoading() {
  return (
    <SkeletonScreen className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex flex-col items-center gap-3">
        <SkeletonBlock className="h-14 w-14 rounded-2xl" />
        <SkeletonBlock className="h-8 w-48 rounded-lg" />
      </div>
      <SkeletonForm fields={2} />
    </SkeletonScreen>
  );
}
