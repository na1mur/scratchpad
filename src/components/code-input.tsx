import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** One-time-code field: digits only, big and spaced, and offered by mobile keyboards' autofill. */
export function CodeInput({
  className,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type" | "inputMode" | "maxLength">) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="000000"
      onChange={(e) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
        onChange?.(e);
      }}
      className={cn("h-12 text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-[0.5em]", className)}
    />
  );
}
