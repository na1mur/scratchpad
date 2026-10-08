import { ExternalLinkIcon } from "lucide-react";

/** Link to where the problem was taken from, labelled by its hostname. */
export function SourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex max-w-full items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="truncate">{new URL(url).hostname.replace(/^www\./, "")}</span>
      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
