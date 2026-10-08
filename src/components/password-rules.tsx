import { CheckIcon, CircleIcon } from "lucide-react";
import { cn } from "cn";
import { PASSWORD_CHECKS } from "@/lib/schemas/auth";

/**
 * The rules for a new password. Neutral until the person starts typing, then each rule shows
 * whether it's met (icon and hidden text, so it doesn't rely on colour).
 */
export function PasswordRules({ value = "" }: { value?: string }) {
  const typing = value.length > 0;
  return (
    <ul className="grid gap-1 text-sm text-ink/70">
      {PASSWORD_CHECKS.map(({ label, test }) => {
        const met = typing && test(value);
        return (
          <li key={label} className={cn("flex items-center gap-2", met && "text-ink")}>
            {met ? (
              <CheckIcon aria-hidden className="size-3.5 text-brand-strong" />
            ) : (
              <CircleIcon aria-hidden className="size-3.5 opacity-50" />
            )}
            {label}
            {typing && <span className="sr-only">{met ? "(done)" : "(not yet)"}</span>}
          </li>
        );
      })}
    </ul>
  );
}
