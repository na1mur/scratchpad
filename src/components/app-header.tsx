"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

const NAV = [{ href: "/problems", label: "Problems" }];

export function AppHeader({ email, name }: { email: string; name: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, pending } = useLogout();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
        <Logo href="/problems" height={28} priority />
        <nav className="flex items-center gap-4 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-muted-foreground transition-colors hover:text-foreground",
                pathname.startsWith(item.href) && "text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" aria-label="Account" />}>
              <UserIcon />
              {name && <span className="hidden max-w-32 truncate sm:inline">{name.split(/\s+/)[0]}</span>}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col">
                  {name && <span className="truncate font-medium text-foreground">{name}</span>}
                  <span className="truncate">{email}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <SettingsIcon /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem disabled={pending} onClick={logout}>
                <LogOutIcon /> {pending ? "Logging out…" : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
