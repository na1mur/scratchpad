"use client";

import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, ImageIcon } from "lucide-react";
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

export type ModelOption = { id: string; label: string; supportsImages: boolean | null };

/** Searchable model dropdown; OpenRouter alone lists hundreds of models. */
export function ModelPicker({
  id,
  models,
  value,
  onChange,
  disabled,
  placeholder = "Select a model",
  invalid,
}: {
  id?: string;
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            disabled={disabled}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className={cn("flex min-w-0 items-baseline gap-2", !value && "text-muted-foreground")}>
          <span className="truncate">{selected?.label ?? (value || placeholder)}</span>
          {selected && selected.label !== selected.id && (
            <span className="truncate font-mono text-xs text-muted-foreground">{selected.id}</span>
          )}
        </span>
        <ChevronsUpDownIcon className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search models…" />
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup>
              {models.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.label} ${m.id}`}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <CheckIcon className={cn("size-4", m.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{m.label}</span>
                    {m.label !== m.id && (
                      <span className="truncate font-mono text-xs text-muted-foreground">{m.id}</span>
                    )}
                  </span>
                  {m.supportsImages && (
                    <ImageIcon aria-label="Supports images" className="size-3.5 text-muted-foreground" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
