import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Only same-site relative paths, so `next` can't become an open redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/problems"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
