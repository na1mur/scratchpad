import { z } from "zod";

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Tell us your name")
  .max(60, "Keep it under 60 characters");

const emailSchema = z.email("Enter a valid email").trim().toLowerCase().max(254);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);
export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });
export type LoginInput = z.infer<typeof loginSchema>;

export const emailOnlySchema = z.object({ email: emailSchema });

export const verifyEmailSchema = z.object({ email: emailSchema, code: otpCodeSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resetPasswordSchema = z.object({ email: emailSchema, code: otpCodeSchema, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const signupSchema = loginSchema.extend({ name: nameSchema });
export type SignupInput = z.infer<typeof signupSchema>;

export const profileSchema = z.object({ name: nameSchema });
export type ProfileInput = z.infer<typeof profileSchema>;

/** Only same-site relative paths, so `next` can't become an open redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/problems"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
