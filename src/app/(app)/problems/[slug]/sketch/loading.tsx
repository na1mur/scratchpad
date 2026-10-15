import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors `SketchView`: the header bar, the palette, the canvas and the problem panel. */
export default function SketchLoading() {
  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem - 1px)" }} aria-busy="true">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Skeleton className="h-7 w-44" />
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-8 md:w-28" />
          <Skeleton className="h-8 w-8 md:w-32" />
          <Skeleton className="hidden size-7 md:block" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col gap-3 border-r bg-background p-2 md:flex">
          <Skeleton className="mx-2 h-3 w-24" />
          <div className="flex flex-col gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
          <Skeleton className="mx-2 mt-2 h-3 w-12" />
          <div className="flex flex-col gap-1">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 bg-paper" />

        <aside className="hidden w-80 shrink-0 flex-col gap-3 border-l bg-background p-4 md:flex">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="mt-2 h-4 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </aside>
      </div>
    </div>
  );
}
