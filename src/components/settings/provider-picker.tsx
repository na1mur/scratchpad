"use client";

import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PROVIDERS, PROVIDER_LABELS, type ProviderId } from "@/lib/providers";

/** Searchable provider dropdown; there are too many providers for a plain select. */
export function ProviderPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="truncate">{PROVIDER_LABELS[value]}</span>
        <ChevronsUpDownIcon className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search providers…" />
          <CommandList>
            <CommandEmpty>No providers found.</CommandEmpty>
            <CommandGroup>
              {PROVIDERS.map((p) => (
                <CommandItem
                  key={p}
                  value={`${PROVIDER_LABELS[p]} ${p}`}
                  onSelect={() => {
                    if (p !== value) onChange(p);
                    setOpen(false);
                  }}
                >
                  <CheckIcon className={cn("size-4", p === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{PROVIDER_LABELS[p]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
