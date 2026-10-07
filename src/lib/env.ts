import "server-only";
import { z } from "zod";

const base64Key = z
  .string()
  .min(1)
  .refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "must be 32 bytes encoded as base64",
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "must be at least 32 characters"),
  ENCRYPTION_KEY: base64Key,
  ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
  // R2 is only needed for notebook image uploads. Leaving these empty disables
  // uploads (the upload routes answer 503) instead of blocking the whole app.
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET: z.string().optional().default(""),
  // Public base URL of the bucket (r2.dev subdomain or custom domain). When
  // set, images are served from it; otherwise via short-lived presigned GETs.
  R2_PUBLIC_URL: z
    .union([z.url().transform((u) => u.replace(/\/+$/, "")), z.literal("")])
    .optional()
    .default(""),
  // Outgoing mail (verification and password-reset codes). Without SMTP_USER
  // and SMTP_PASS the codes are printed to the server console in development
  // and sending fails in production.
  SMTP_HOST: z.string().optional().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional().default(""),
  // Gmail app passwords are displayed in groups separated by spaces.
  SMTP_PASS: z
    .string()
    .optional()
    .default("")
    .transform((v) => v.replace(/\s+/g, "")),
  EMAIL_FROM: z.string().optional().default(""),
  // "Log in with Google" is hidden unless both are set.
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  APP_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  }
  return parsed.data;
}

export const env = loadEnv();

export const r2Enabled = Boolean(
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
);

export const emailEnabled = Boolean(env.SMTP_USER && env.SMTP_PASS);
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
