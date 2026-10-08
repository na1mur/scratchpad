"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";

const LENGTH = 6;

/** One-time-code field: six digit boxes, digits only, and offered by mobile keyboards' autofill. */
export function CodeInput({
  invalid,
  ...props
}: Omit<React.ComponentProps<typeof InputOTP>, "maxLength" | "pattern" | "children" | "render"> & {
  invalid?: boolean;
}) {
  const slot =
    "h-12 w-10 bg-sheet text-xl font-mono sm:w-11 data-[active=true]:border-pen-blue data-[active=true]:ring-pen-blue/30";
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
      <InputOTPGroup>
        {[0, 1, 2].map((i) => (
          <InputOTPSlot key={i} index={i} aria-invalid={invalid} className={slot} />
        ))}
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        {[3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} aria-invalid={invalid} className={slot} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
