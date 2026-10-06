import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="grid flex-1 gap-0 lg:grid-cols-[38%_1fr]">
      <div className="flex flex-col gap-4 border-r p-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 xl:grid-cols-[2fr_3fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  );
}
