import Image from "next/image";
import { cn } from "cn";
import type { LanguageId } from "@/lib/languages";

/** A language's logo, from `public/languages/<id>.png`. */
export function LanguageIcon({ id, className }: { id: LanguageId; className?: string }) {
  return (
    <Image
      src={`/languages/${id}.png`}
      alt=""
      aria-hidden
      width={24}
      height={24}
      className={cn("size-6 shrink-0 object-contain", className)}
    />
  );
}
