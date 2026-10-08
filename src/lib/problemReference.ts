import "server-only";
import { languageLabel } from "@/lib/languages";
import { safeRequest } from "@/lib/problemSource";
import { Problem, type ProblemDoc } from "@/models/Problem";

/**
 * Known solutions to a problem, found on the web and given to the model as
 * reference: for a solution it's a starting point that the sandbox run then
 * checks, for an attempt it tells the tutor what correct looks like. LeetCode
 * links go straight to the doocs/leetcode repository on GitHub; anything else
 * goes through Tavily search when TAVILY_API_KEY is set.
 */

export type ReferenceSource = { title: string; url: string; license?: string };
export type Reference = { text: string; sources: ReferenceSource[] };

/** Longest reference text kept; it goes into the solve, understand and diagnose prompts. */
export const MAX_REFERENCE_TEXT = 8_000;
const FETCH_TIMEOUT_MS = 10_000;
// A lookup that found nothing is tried again after this, in case a key was added or the repo caught up.
const RETRY_EMPTY_AFTER_MS = 24 * 60 * 60 * 1000;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// doocs/leetcode -------------------------------------------------------------

const DOOCS = "doocs/leetcode";
const DOOCS_LICENSE = "CC BY-SA 4.0";

// Tab headings in doocs READMEs, best match first. Pseudo-code learners get Python, the closest in spirit.
const DOOCS_TABS: Record<string, string[]> = {
  python: ["Python3"],
  javascript: ["JavaScript", "TypeScript"],
  typescript: ["TypeScript", "JavaScript"],
  java: ["Java"],
  cpp: ["C++"],
  csharp: ["C#"],
  go: ["Go"],
  pseudocode: ["Python3"],
};

/** Strips the KaTeX doocs uses in prose: `$\textit{nums}[i]$` → `nums[i]`. */
function plainMath(text: string): string {
  return text
    .replace(/\\(?:textit|textbf|text|mathit|operatorname)\{([^}]*)\}/g, "$1")
    .replace(/\\(le|leq)\b/g, "<=")
    .replace(/\\(ge|geq)\b/g, ">=")
    .replace(/\\times\b/g, "×")
    .replace(/\\to\b/g, "→")
    .replace(/\\log\b/g, "log")
    .replace(/\$/g, "");
}

/** Each "### Solution N: name" section as its explanation plus the code in the wanted language. */
export function parseDoocsReadme(md: string, language: string): string {
  const wanted = DOOCS_TABS[language] ?? ["Python3"];
  const sections = md
    .split("<!-- solution:start -->")
    .slice(1)
    .map((chunk) => chunk.split("<!-- solution:end -->")[0]);

  const parts: string[] = [];
  for (const section of sections) {
    const heading = /^###\s+(.+)$/m.exec(section)?.[1]?.trim() ?? "Solution";
    const [prose = "", tabs = ""] = section.split("<!-- tabs:start -->");
    const explanation = plainMath(
      prose
        .replace(/^###.*$/m, "")
        .replace(/<!--.*?-->/g, "")
        .replace(/^>\s?/gm, "")
        .replace(/\*\*Thinking\*\*\n/, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    );
    const blocks = [...tabs.matchAll(/^####\s+(.+?)\s*\n+```(\w*)\n([\s\S]*?)\n```/gm)].map((m) => ({
      tab: m[1],
      fence: m[2],
      code: m[3],
    }));
    const block =
      wanted.map((t) => blocks.find((b) => b.tab === t)).find(Boolean) ??
      blocks.find((b) => b.tab === "Python3") ??
      blocks[0];
    if (!block) continue;
    parts.push(`${heading}\n${explanation}\n\n\`\`\`${block.fence}\n${block.code}\n\`\`\``);
  }
  return parts.join("\n\n---\n\n");
}

/** Frontend id ("1") and title ("Two Sum") for a LeetCode slug. */
async function leetCodeQuestion(slug: string, signal: AbortSignal): Promise<{ id: string; title: string } | null> {
  const res = await safeRequest(new URL("https://leetcode.com/graphql"), {
    method: "POST",
    headers: { "content-type": "application/json", referer: `https://leetcode.com/problems/${slug}/` },
    body: JSON.stringify({
      query: "query q($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId title } }",
      variables: { titleSlug: slug },
    }),
    signal,
  });
  if (res.status !== 200) return null;
  const q = (JSON.parse(res.body) as { data?: { question?: { questionFrontendId?: string; title?: string } | null } }).data
    ?.question;
  return q?.questionFrontendId && q.title && /^\d+$/.test(q.questionFrontendId) ? { id: q.questionFrontendId, title: q.title } : null;
}

const rawUrl = (path: string) =>
  new URL(`https://raw.githubusercontent.com/${DOOCS}/main/${path.split("/").map(encodeURIComponent).join("/")}`);
const htmlUrl = (path: string) => `https://github.com/${DOOCS}/blob/main/${path.split("/").map(encodeURIComponent).join("/")}`;

/** The problem's English README in doocs/leetcode, e.g. `solution/0100-0199/0121.Best Time to Buy and Sell Stock/README_EN.md`. */
async function doocsReadme(id: string, title: string, signal: AbortSignal): Promise<{ path: string; body: string } | null> {
  const start = Math.floor(Number(id) / 100) * 100;
  const range = `solution/${String(start).padStart(4, "0")}-${String(start + 99).padStart(4, "0")}`;
  const prefix = `${id.padStart(4, "0")}.`;
  const read = async (folder: string) => {
    const path = `${folder}/README_EN.md`;
    const res = await safeRequest(rawUrl(path), { signal });
    return res.status === 200 ? { path, body: res.body } : null;
  };

  // The folder is usually the id and the title as is; titles with odd characters are renamed, so list the range then.
  const guessed = await read(`${range}/${prefix}${title}`);
  if (guessed) return guessed;
  const list = await safeRequest(new URL(`https://api.github.com/repos/${DOOCS}/contents/${range}?ref=main`), {
    headers: { accept: "application/vnd.github+json" },
    signal,
  });
  if (list.status !== 200) return null;
  const entries = JSON.parse(list.body) as { name?: string; path?: string; type?: string }[];
  const folder = entries.find((e) => e.type === "dir" && e.name?.startsWith(prefix))?.path;
  return folder ? read(folder) : null;
}

async function fromDoocs(slug: string, language: string, signal: AbortSignal): Promise<Reference | null> {
  const q = await leetCodeQuestion(slug, signal);
  if (!q) return null;
  const readme = await doocsReadme(q.id, q.title, signal);
  if (!readme) return null;
  const { path } = readme;
  const text = parseDoocsReadme(readme.body, language);
  if (!text) return null;
  return {
    text: clip(text, MAX_REFERENCE_TEXT),
    sources: [{ title: `${DOOCS}: ${q.id}. ${q.title}`, url: htmlUrl(path), license: DOOCS_LICENSE }],
  };
}

// Web search -----------------------------------------------------------------

type TavilyResult = { title?: string; url?: string; content?: string; raw_content?: string | null };

// Statement-only pages, or ones that render their solutions client-side, so their text is no use.
const SEARCH_EXCLUDE = ["leetcode.com", "leetcode.cn", "youtube.com"];
const PER_RESULT_TEXT = 3_000;

/** The code blocks of a page (where the solution is), else its opening text. */
function solutionPart(markdown: string): string {
  const fences = [...markdown.matchAll(/```[^\n]*\n[\s\S]*?\n```/g)].map((m) => m[0]);
  return fences.length ? fences.join("\n\n") : markdown;
}

async function fromSearch(
  problem: Pick<ProblemDoc, "title" | "sourceUrl">,
  language: string,
  signal: AbortSignal,
): Promise<Reference | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  let site = "";
  try {
    if (problem.sourceUrl) site = new URL(problem.sourceUrl).hostname.replace(/^www\./, "");
  } catch {}
  const lang = language === "pseudocode" ? "" : languageLabel(language);
  const query = [problem.title, site, lang, "solution"].filter(Boolean).join(" ").slice(0, 380);

  // api.tavily.com is a fixed public host, so a plain fetch is fine here.
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 3,
      include_raw_content: "markdown",
      exclude_domains: SEARCH_EXCLUDE,
    }),
    signal,
  });
  if (!res.ok) {
    console.warn(`[reference] search failed: ${res.status}`);
    return null;
  }
  const results = ((await res.json()) as { results?: TavilyResult[] }).results ?? [];
  // The URLs end up as links on the solution page, so only plain web links.
  const usable = results.filter((r) => r.url && /^https?:\/\//i.test(r.url) && (r.raw_content || r.content));
  if (!usable.length) return null;

  const text = usable
    .map((r) => `From ${r.title || r.url} (${r.url}):\n${clip(solutionPart(r.raw_content || r.content || ""), PER_RESULT_TEXT)}`)
    .join("\n\n---\n\n");
  return {
    text: clip(text, MAX_REFERENCE_TEXT),
    sources: usable.map((r) => ({ title: clip(r.title || r.url!, 200), url: r.url! })),
  };
}

// Entry points ---------------------------------------------------------------

function leetCodeSlug(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (!/(^|\.)leetcode\.(com|cn)$/i.test(url.hostname)) return null;
    return /^\/problems\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Best-effort lookup: doocs/leetcode for LeetCode links, then web search. Never throws. */
export async function findReference(
  problem: Pick<ProblemDoc, "title" | "sourceUrl">,
  language: string,
): Promise<Reference | null> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    const slug = leetCodeSlug(problem.sourceUrl);
    const fromRepo = slug ? await fromDoocs(slug, language, signal).catch(() => null) : null;
    return fromRepo ?? (await fromSearch(problem, language, signal));
  } catch (err) {
    console.warn(`[reference] lookup for "${problem.title}" failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

type ReferenceProblem = Pick<ProblemDoc, "_id" | "title" | "sourceUrl" | "references">;
type StoredEntry = ProblemDoc["references"][number];

function fromEntry(entry: StoredEntry | undefined): Reference | null {
  if (!entry?.text) return null;
  return {
    text: entry.text,
    sources: (entry.sources ?? []).map((s) => ({ title: s.title, url: s.url, ...(s.license && { license: s.license }) })),
  };
}

/** The stored reference for this language, if a lookup has run. Doesn't fetch. */
export function storedReference(problem: Pick<ProblemDoc, "references">, language: string): Reference | null {
  return fromEntry(problem.references?.find((r) => r.language === language));
}

/**
 * The reference for this language, looking it up first if that hasn't been
 * done (or found nothing a day ago). The result is stored on the problem, and
 * an empty one is recorded too so it isn't searched on every run. Editing the
 * title or link clears them all.
 */
export async function ensureProblemReference(problem: ReferenceProblem, language: string): Promise<Reference | null> {
  const entry = problem.references?.find((r) => r.language === language);
  if (entry && (entry.text || Date.now() - new Date(entry.fetchedAt).getTime() < RETRY_EMPTY_AFTER_MS)) {
    return fromEntry(entry);
  }

  const found = await findReference(problem, language);
  // Skip the write if the title or link changed in the meantime.
  const unchanged = {
    _id: problem._id,
    title: problem.title,
    sourceUrl: problem.sourceUrl ? problem.sourceUrl : { $exists: false },
  };
  await Problem.updateOne(unchanged, { $pull: { references: { language } } });
  await Problem.updateOne(unchanged, {
    $push: {
      references: { language, text: found?.text ?? "", sources: found?.sources ?? [], fetchedAt: new Date() },
    },
  });
  return found;
}
