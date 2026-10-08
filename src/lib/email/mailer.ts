import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { ApiError } from "@/lib/api";
import { emailEnabled, env } from "@/lib/env";

export type Mail = { to: string; subject: string; text: string; html: string };

const globalForMailer = globalThis as unknown as { __mailer?: Transporter };

function transporter(): Transporter {
  return (globalForMailer.__mailer ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  }));
}

// Inboxes show the display name of the From header, so a bare address would
// appear as just "naeemhasan28". Always attach one; EMAIL_FROM may override it
// with a full `Name <address>` or a bare address.
function sender(): string | { name: string; address: string } {
  const from = env.EMAIL_FROM || env.SMTP_USER;
  if (from.includes("<")) return from;
  return { name: "ScratchPad", address: from };
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!emailEnabled) {
    if (env.NODE_ENV === "production") {
      console.error("[email] SMTP_USER/SMTP_PASS are not set; cannot send email.");
      throw new ApiError(503, "email_unavailable", "Email isn't set up on this server.");
    }
    // Development convenience: the message is the whole point, so show it.
    console.log(`[email] (SMTP not configured) to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  try {
    await transporter().sendMail({ from: sender(), ...mail });
  } catch (err) {
    console.error("[email] send failed:", err instanceof Error ? err.message : err);
    throw new ApiError(502, "email_failed", "We couldn't send the email. Please try again in a moment.");
  }
}
