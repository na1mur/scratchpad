import { AlertCircleIcon } from "lucide-react";
import { cn } from "cn";

/** Shared look for the auth pages' controls: 44px tall, 16px text, pen-blue focus like the landing page. */
export const authInput =
  "h-11 bg-sheet text-base md:text-base focus-visible:border-pen-blue focus-visible:ring-pen-blue/30";
export const authButton = "h-11 w-full text-base";
export const inkButton = "bg-ink text-paper hover:bg-ink/85";
export const authLink =
  "rounded-sm text-ink underline underline-offset-4 outline-none hover:text-ink/70 focus-visible:ring-2 focus-visible:ring-pen-blue/60";

export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-3">
      <h1 className="text-display text-[2.5rem] text-balance">{title}</h1>
      {children && <p className="leading-6 text-ink/75">{children}</p>}
    </div>
  );
}

/** A problem with the whole form rather than one field. Announced when it appears and stays until the next try. */
export function FormAlert({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive",
        className,
      )}
    >
      <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
