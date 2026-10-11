const MAX_SLUG = 100;

/** A problem's page, from a serialized problem (`slug` falls back to the id for problems from before slugs). */
export const problemPath = (p: { slug: string }) => `/problems/${p.slug}`;

/** Lowercase ASCII words joined by hyphens; accents are folded and everything else is dropped. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `two-sum-array-hash-map`: the title, then every tag. Cut at a word boundary so it stays readable. */
export function problemSlugBase(title: string, tags: readonly string[]): string {
  const full = slugify([title, ...tags].join(" ")) || "problem";
  if (full.length <= MAX_SLUG) return full;
  const cut = full.slice(0, MAX_SLUG);
  return cut.slice(0, cut.lastIndexOf("-") > 0 ? cut.lastIndexOf("-") : MAX_SLUG);
}
