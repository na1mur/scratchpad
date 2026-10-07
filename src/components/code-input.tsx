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
  const slot = "size-11 text-xl font-mono sm:size-12";
  return (
    <InputOTP
      {...props}
      maxLength={LENGTH}
      pattern={REGEXP_ONLY_DIGITS}
      autoComplete="one-time-code"
      aria-invalid={invalid}
      containerClassName="justify-center"
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
