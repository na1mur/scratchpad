import { Skeleton } from "@/components/ui/skeleton";

// Without this, /problems/loading.tsx (the problem grid) would show while the form loads.
export default function NewProblemLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-32" />
    </main>
  );
}
