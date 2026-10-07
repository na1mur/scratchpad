import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Soft spotlight behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,var(--color-foreground)/8%,transparent_70%)]"
      />
      <header className="relative flex justify-end px-6 py-4">
        <ThemeToggle />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-20">{children}</main>
    </div>
  );
}
