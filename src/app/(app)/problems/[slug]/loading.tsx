import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="grid flex-1 gap-0 lg:grid-cols-[38%_1fr]" aria-busy="true">
      <div className="flex flex-col gap-4 border-b p-4 lg:border-r lg:border-b-0">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-3/4" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Skeleton className="h-8 w-64" />
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
