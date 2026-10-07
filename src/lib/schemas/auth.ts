import { z } from "zod";

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Tell us your name")
  .max(60, "Keep it under 60 characters");

const emailSchema = z.email("Enter a valid email").trim().toLowerCase().max(254);
export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

/** Rules for choosing a password (signup, reset). Shown under the field via `PASSWORD_RULES`. */
export const PASSWORD_RULES = ["8–32 characters", "At least 1 letter", "At least 1 special character"] as const;
const PASSWORD_LENGTH = /^[\s\S]{8,32}$/;
const PASSWORD_LETTER = /[A-Za-z]/;
const PASSWORD_SPECIAL = /[^A-Za-z0-9\s]/;

const newPasswordSchema = z
  .string()
  .regex(PASSWORD_LENGTH, "Password must be 8 to 32 characters long")
  .regex(PASSWORD_LETTER, "Password must include at least 1 letter")
  .regex(PASSWORD_SPECIAL, "Password must include at least 1 special character");

// Login skips the composition rules so accounts made under the old rules (8+ characters, anything) can still
// sign in. The cap matches the new maximum; no existing password is longer.
const loginPasswordSchema = z.string().min(1, "Enter your password").max(32);

const passwordsMatch = (v: { password: string; confirmPassword: string }) => v.password === v.confirmPassword;
const passwordsMismatch = { message: "Passwords don't match", path: ["confirmPassword"] };

export const loginSchema = z.object({ email: emailSchema, password: loginPasswordSchema });
export type LoginInput = z.infer<typeof loginSchema>;

export const emailOnlySchema = z.object({ email: emailSchema });

export const verifyEmailSchema = z.object({ email: emailSchema, code: otpCodeSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, passwordsMismatch);
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const signupSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, passwordsMismatch);
export type SignupInput = z.infer<typeof signupSchema>;

export const profileSchema = z.object({ name: nameSchema });
export type ProfileInput = z.infer<typeof profileSchema>;

/** Only same-site relative paths, so `next` can't become an open redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/problems"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
