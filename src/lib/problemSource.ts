import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import * as cheerio from "cheerio";
import { Problem, type ProblemDoc } from "@/models/Problem";

/** Longest page text kept; it's sent with most model calls for the problem. */
export const MAX_SOURCE_TEXT = 8_000;

// Less than this is a JS-only shell or a menu, not a problem statement.
const MIN_SOURCE_TEXT = 200;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; Scratchpad/1.0; problem page reader)";

// Learner-supplied URLs are fetched from the server, so private, loopback and other internal ranges are off limits.
const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 127], // :: and ::1
  // Not ::ffff:0:0/96: BlockList checks IPv4 addresses as IPv4-mapped, so that would block all of them.
  // Mapped addresses are unwrapped and checked as IPv4 in isBlockedAddress instead.
  ["64:ff9b::", 96], // NAT64
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

function isBlockedAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return isBlockedAddress(mapped);
  const family = net.isIP(address);
  if (family === 0) return true;
  // Any other IPv4-mapped form (e.g. ::ffff:7f00:1) isn't something a public page needs.
  if (family === 6 && /^::ffff:/i.test(address)) return true;
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Resolves like dns.lookup but refuses hosts that resolve to an internal address, at connect time. */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, "");
    if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} resolves to a blocked address`), { code: "EBLOCKED" }), "");
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

type Response = { status: number; contentType: string; body: string };

function checkUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("unsupported port");
  if (url.username || url.password) throw new Error("credentials in URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Literal IPs skip the lookup hook, so check them here.
  if (net.isIP(host) && isBlockedAddress(host)) throw new Error("blocked address");
}

function decompress(body: Buffer, encoding: string | undefined): Buffer {
  const opts = { maxOutputLength: MAX_BODY_BYTES * 4 };
  switch (encoding?.toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.gunzipSync(body, opts);
    case "deflate":
      return zlib.inflateSync(body, opts);
    case "br":
      return zlib.brotliDecompressSync(body, opts);
    default:
      return body;
  }
}

function decode(body: Buffer, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/"/g, "");
  try {
    return new TextDecoder(charset || "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function request(
  url: URL,
  init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; signal: AbortSignal },
  redirectsLeft = MAX_REDIRECTS,
): Promise<Response> {
  checkUrl(url);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise<Response>((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: init.method ?? "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8",
          "accept-encoding": "gzip, deflate, br",
          ...init.headers,
        },
        lookup: safeLookup,
        signal: init.signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && (init.method ?? "GET") === "GET") {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error("too many redirects"));
          let next: URL;
          try {
            next = new URL(res.headers.location, url);
          } catch {
            return reject(new Error("bad redirect"));
          }
          return request(next, init, redirectsLeft - 1).then(resolve, reject);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy(new Error("response too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            const contentType = String(res.headers["content-type"] ?? "");
            const raw = decompress(Buffer.concat(chunks), res.headers["content-encoding"]);
            resolve({ status, contentType, body: decode(raw, contentType) });
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
}

// HTML to text ---------------------------------------------------------------

const NOISE = "script, style, noscript, svg, template, iframe, nav, footer, header, form, button, head";
const BLOCKS = "p, div, ul, ol, li, h1, h2, h3, h4, h5, h6, tr, table, section, blockquote, dl, dd, dt";
// Most specific first: Codeforces' statement block, then the page's main content.
const CONTENT = [".problem-statement", "main", "article", "body"];

/** Readable text from a page: drops chrome and scripts, keeps paragraphs, lists and <pre> examples. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  $(NOISE).remove();
  const root =
    CONTENT.map((sel) => $(sel).first()).find((el) => el.length && el.text().trim().length > 200) ?? $.root();

  // <pre> examples keep their exact whitespace: park them behind placeholders while the rest is collapsed.
  const pres: string[] = [];
  root.find("pre").each((_, el) => {
    pres.push($(el).text().replace(/\s+$/, ""));
    // Private-use characters: the parser drops NULs, and pages don't use these.
    $(el).replaceWith(`\n${pres.length - 1}\n`);
  });
  root.find("sup").each((_, el) => {
    $(el).replaceWith(`^${$(el).text()}`);
  });
  root.find("br").replaceWith("\n");
  root.find("li").prepend("- ");
  root.find("td, th").after("\t");
  root.find(BLOCKS).before("\n").after("\n");

  const text = root
    .text()
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\d+)/g,(_, i: string) => pres[Number(i)] ?? "")
    .trim();
  return title && !text.startsWith(title) ? `${title}\n\n${text}` : text;
}

function clip(text: string): string {
  return text.length > MAX_SOURCE_TEXT ? `${text.slice(0, MAX_SOURCE_TEXT - 1).trimEnd()}…` : text;
}

// Fetchers -------------------------------------------------------------------

/** LeetCode renders problems client-side, so ask its GraphQL API for the statement instead. */
async function fetchLeetCode(url: URL, signal: AbortSignal): Promise<string | null> {
  const slug = /^\/problems\/([^/]+)/.exec(url.pathname)?.[1];
  if (!slug) return null;
  const origin = url.hostname.endsWith("leetcode.cn") ? "https://leetcode.cn" : "https://leetcode.com";
  const res = await request(new URL("/graphql", origin), {
    method: "POST",
    headers: { "content-type": "application/json", referer: `${origin}/problems/${slug}/` },
    body: JSON.stringify({
      query: "query q($titleSlug: String!) { question(titleSlug: $titleSlug) { title content translatedContent } }",
      variables: { titleSlug: slug },
    }),
    signal,
  });
  if (res.status !== 200) return null;
  const q = (JSON.parse(res.body) as { data?: { question?: { title?: string; content?: string; translatedContent?: string } | null } })
    .data?.question;
  // Premium problems come back without content.
  const html = q?.content || q?.translatedContent;
  if (!html) return null;
  return `${q.title ?? slug}\n\n${htmlToText(html)}`;
}

async function fetchGeneric(url: URL, signal: AbortSignal): Promise<string | null> {
  const res = await request(url, { signal });
  if (res.status !== 200) return null;
  if (/text\/plain/i.test(res.contentType)) return res.body.trim();
  if (!/html/i.test(res.contentType)) return null;
  return htmlToText(res.body);
}

/**
 * Best-effort text of the linked problem page. Returns null when the page
 * can't be read or has too little text to be the problem (a JS-only shell,
 * a login wall); never throws.
 */
export async function fetchSourceText(rawUrl: string): Promise<string | null> {
  try {
    const url = new URL(rawUrl);
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const isLeetCode = /(^|\.)leetcode\.(com|cn)$/i.test(url.hostname);
    const text = isLeetCode
      ? ((await fetchLeetCode(url, signal).catch(() => null)) ?? (await fetchGeneric(url, signal)))
      : await fetchGeneric(url, signal);
    return text && text.length >= MIN_SOURCE_TEXT ? clip(text) : null;
  } catch (err) {
    console.warn(`[source] couldn't read ${rawUrl}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetches the page and stores its text on the problem. A failed fetch is
 * recorded too (sourceFetchedAt without sourceText) so it isn't retried on
 * every run; changing the URL clears both and fetches again. Skips the write
 * if the URL changed in the meantime.
 */
export async function refreshProblemSource(problemId: ProblemDoc["_id"], url: string): Promise<string | null> {
  const text = await fetchSourceText(url);
  await Problem.updateOne(
    { _id: problemId, sourceUrl: url },
    text
      ? { $set: { sourceText: text, sourceFetchedAt: new Date() } }
      : { $set: { sourceFetchedAt: new Date() }, $unset: { sourceText: "" } },
  );
  return text;
}

/** The stored page text, fetching it first if this link hasn't been tried yet. "" when there's none. */
export async function ensureProblemSource(problem: Pick<ProblemDoc, "_id" | "sourceUrl" | "sourceText" | "sourceFetchedAt">) {
  if (!problem.sourceUrl) return "";
  if (problem.sourceFetchedAt) return problem.sourceText ?? "";
  return (await refreshProblemSource(problem._id, problem.sourceUrl)) ?? "";
}
