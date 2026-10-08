"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const LENGTH = 6;

/** One-time-code field: six separate digit boxes, digits only, and offered by mobile keyboards' autofill. */
export function CodeInput({
  invalid,
  ...props
}: Omit<React.ComponentProps<typeof InputOTP>, "maxLength" | "pattern" | "children" | "render"> & {
  invalid?: boolean;
}) {
  // The slot defaults join neighbours into one bar (border-y/border-r, rounded only at the ends),
  // so each box restates a full border and corner, including the first:/last: variants.
  const slot =
    "h-12 w-10 rounded-lg border bg-sheet font-mono text-xl first:rounded-lg first:border last:rounded-lg sm:h-13 sm:w-11 data-[active=true]:border-pen-blue data-[active=true]:ring-pen-blue/30";
  return (
    <InputOTP
      {...props}
      maxLength={LENGTH}
      pattern={REGEXP_ONLY_DIGITS}
      autoComplete="one-time-code"
      inputMode="numeric"
      aria-invalid={invalid}
      containerClassName="justify-start"
    >
      {/* The group's own invalid ring would wrap all six boxes; each box shows its own. */}
      <InputOTPGroup className="gap-2 has-aria-invalid:ring-0 dark:has-aria-invalid:ring-0">
        {Array.from({ length: LENGTH }, (_, i) => (
          <InputOTPSlot key={i} index={i} aria-invalid={invalid} className={slot} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
