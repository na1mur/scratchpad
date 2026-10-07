import "server-only";
import { OTP_LENGTH } from "@/lib/auth/otp";
import type { Mail } from "@/lib/email/mailer";
import type { OtpPurpose } from "@/models/OtpCode";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const COPY: Record<OtpPurpose, { subject: string; intro: string; ignore: string }> = {
  verify_email: {
    subject: "Verify your email for Scratchpad",
    intro: "Use this code to verify your email and finish creating your Scratchpad account.",
    ignore: "If you didn't sign up, you can ignore this email.",
  },
  reset_password: {
    subject: "Reset your Scratchpad password",
    intro: "Use this code to choose a new Scratchpad password.",
    ignore: "If you didn't ask for this, you can ignore this email. Your password won't change.",
  },
};

export function otpEmail(opts: { to: string; name?: string | null; code: string; purpose: OtpPurpose }): Mail {
  const { subject, intro, ignore } = COPY[opts.purpose];
  const greeting = opts.name ? `Hi ${opts.name.split(/\s+/)[0]},` : "Hi,";
  const text = `${greeting}\n\n${intro}\n\n${opts.code}\n\nThe code expires in 10 minutes. ${ignore}\n`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#111">
<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px;line-height:1.5">${intro}</p>
<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,Consolas,monospace" aria-label="${opts.code.split("").join(" ")}">${opts.code}</p>
<p style="margin:0;color:#555;font-size:13px;line-height:1.5">This ${OTP_LENGTH}-digit code expires in 10 minutes. ${ignore}</p>
</div>`;
  return { to: opts.to, subject, text, html };
}
