import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10" aria-busy="true">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </main>
  );
}
