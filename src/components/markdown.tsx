import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "cn";

export const markdownComponents: Components = {
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

// Compact prose for chat bubbles. Every typography color follows the bubble's own text color,
// so the same styles work on the sheet-colored answers and the primary-colored questions.
const chatProse = [
  "prose prose-sm max-w-none break-words",
  "[--tw-prose-body:currentColor] [--tw-prose-headings:currentColor] [--tw-prose-bold:currentColor]",
  "[--tw-prose-links:currentColor] [--tw-prose-code:currentColor] [--tw-prose-quotes:currentColor]",
  "[--tw-prose-bullets:color-mix(in_oklch,currentColor_50%,transparent)]",
  "[--tw-prose-counters:color-mix(in_oklch,currentColor_60%,transparent)]",
  "[--tw-prose-hr:color-mix(in_oklch,currentColor_15%,transparent)]",
  "[--tw-prose-quote-borders:color-mix(in_oklch,currentColor_25%,transparent)]",
  "[--tw-prose-th-borders:color-mix(in_oklch,currentColor_30%,transparent)]",
  "[--tw-prose-td-borders:color-mix(in_oklch,currentColor_15%,transparent)]",
  "[--tw-prose-pre-code:currentColor] [--tw-prose-pre-bg:color-mix(in_oklch,currentColor_8%,transparent)]",
  "prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-blockquote:my-2",
  "prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:text-sm prose-headings:font-semibold",
  "prose-a:underline-offset-2",
  "prose-code:rounded prose-code:bg-current/10 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-medium",
  "prose-code:before:content-none prose-code:after:content-none",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:font-normal",
  "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
].join(" ");

/** Model answers and learner questions, rendered as GitHub-flavored markdown. */
export function ChatMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn(chatProse, className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </Markdown>
    </div>
  );
}
