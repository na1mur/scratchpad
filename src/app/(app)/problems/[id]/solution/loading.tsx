import { Skeleton } from "@/components/ui/skeleton";

export default function SolutionLoading() {
  return (
    <div className="grid flex-1 gap-0 lg:grid-cols-[38%_1fr]" aria-busy="true">
      <div className="flex flex-col gap-4 border-b p-4 lg:border-r lg:border-b-0">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 xl:grid-cols-[2fr_3fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  );
}
