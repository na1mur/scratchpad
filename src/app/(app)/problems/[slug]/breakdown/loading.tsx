import { Skeleton } from "@/components/ui/skeleton";

export default function LessonLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 sm:p-6" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-7 w-72" />
      <Skeleton className="min-h-[32rem] w-full flex-1 rounded-2xl" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}
