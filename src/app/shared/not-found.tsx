import Link from "next/link";
import { Link2OffIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function SharedNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <Link2OffIcon className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-xl font-semibold">This link isn&apos;t shared</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Its owner may have stopped sharing it or deleted it, or the link is mistyped.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Go to Scratchpad
      </Link>
    </main>
  );
}
