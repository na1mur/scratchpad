import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LEGAL_DOCS, readLegalDoc, type LegalDoc } from "@/lib/legal";

// Typography's palette is pointed at the app's ink and pen tokens, which already switch with the theme.
const prose = [
  "prose prose-neutral max-w-none",
  "[--tw-prose-body:color-mix(in_oklch,var(--ink)_82%,transparent)]",
  "[--tw-prose-headings:var(--ink)] [--tw-prose-lead:var(--ink)] [--tw-prose-bold:var(--ink)]",
  "[--tw-prose-links:var(--pen-blue)] [--tw-prose-code:var(--ink)]",
  "[--tw-prose-bullets:color-mix(in_oklch,var(--ink)_45%,transparent)]",
  "[--tw-prose-counters:color-mix(in_oklch,var(--ink)_55%,transparent)]",
  "[--tw-prose-hr:color-mix(in_oklch,var(--ink)_15%,transparent)]",
  "[--tw-prose-th-borders:color-mix(in_oklch,var(--ink)_30%,transparent)]",
  "[--tw-prose-td-borders:color-mix(in_oklch,var(--ink)_15%,transparent)]",
  "prose-h1:text-4xl prose-h1:font-semibold prose-h1:tracking-tight",
  "prose-h2:mt-10 prose-h2:text-xl prose-h2:font-semibold prose-h2:scroll-mt-6",
  "prose-h3:mt-6 prose-h3:text-base prose-h3:font-semibold",
  "prose-a:font-medium prose-a:underline-offset-2 hover:prose-a:text-ink",
  "prose-code:rounded prose-code:bg-ink/10 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-medium",
  "prose-code:before:content-none prose-code:after:content-none",
  "prose-th:whitespace-nowrap",
].join(" ");

const components: Components = {
  a({ href = "", children }) {
    // Site paths and in-page anchors stay in the app; everything else opens in a new tab.
    if (href.startsWith("/") || href.startsWith("#")) return <Link href={href}>{children}</Link>;
    const external = /^https?:/.test(href);
    return (
      <a href={href} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>
        {children}
      </a>
    );
  },
};

const footerLink =
  "rounded-sm outline-none hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-pen-blue/60";

/** A markdown document from `data/` on the landing page's paper palette. */
export async function LegalPage({ doc }: { doc: LegalDoc }) {
  const source = await readLegalDoc(doc);

  return (
    <div className="flex flex-1 flex-col bg-paper text-ink">
      <header className="mx-auto flex h-[4.25rem] w-full max-w-3xl items-center justify-between px-4 sm:px-6">
        <Logo href="/" height={32} priority />
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16 sm:px-6">
        <article className={prose}>
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
            {source}
          </Markdown>
        </article>
      </main>
      <footer className="border-t border-ink/15 bg-sheet">
        <nav
          aria-label="Legal"
          className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-5 gap-y-2 px-4 py-5 text-sm text-ink/70 sm:px-6"
        >
          <Link href="/" className={footerLink}>
            Home
          </Link>
          {(Object.keys(LEGAL_DOCS) as LegalDoc[]).map((name) => (
            <Link key={name} href={`/${name}`} aria-current={name === doc ? "page" : undefined} className={footerLink}>
              {LEGAL_DOCS[name].title}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
