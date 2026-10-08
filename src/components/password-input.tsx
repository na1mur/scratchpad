"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";

/** A password field with a show/hide toggle. Takes the same props as `Input` (minus `type`). */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink/70 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-pen-blue/60 disabled:opacity-50"
      >
        {shown ? <EyeOffIcon aria-hidden className="size-4" /> : <EyeIcon aria-hidden className="size-4" />}
      </button>
    </div>
  );
}
