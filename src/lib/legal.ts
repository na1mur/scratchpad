import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const LEGAL_DOCS = {
  "privacy-policy": { title: "Privacy Policy", description: "How Scratchpad collects, uses and protects your information." },
  "terms-of-service": { title: "Terms of Service", description: "The rules for using Scratchpad." },
} as const;

export type LegalDoc = keyof typeof LEGAL_DOCS;

/** Markdown source for a legal page, from `data/<name>.md`. */
export function readLegalDoc(name: LegalDoc) {
  return readFile(path.join(process.cwd(), "data", `${name}.md`), "utf8");
}
