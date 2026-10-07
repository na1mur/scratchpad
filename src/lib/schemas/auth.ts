import { z } from "zod";

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Tell us your name")
  .max(60, "Keep it under 60 characters");

export const loginSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = loginSchema.extend({ name: nameSchema });
export type SignupInput = z.infer<typeof signupSchema>;

export const profileSchema = z.object({ name: nameSchema });
export type ProfileInput = z.infer<typeof profileSchema>;

/** Only same-site relative paths, so `next` can't become an open redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/problems"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
