import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <SearchXIcon className="size-8 text-muted-foreground" />
      <div>
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">That page doesn&apos;t exist, or it isn&apos;t yours.</p>
      </div>
      <Link href="/problems" className={buttonVariants({ variant: "outline" })}>
        Back to problems
      </Link>
    </main>
  );
}
