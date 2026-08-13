import { Email } from "@convex-dev/auth/providers/Email";
import { ConvexError } from "convex/values";
import { ALLOWED_EMAILS } from "./allowedEmails";
import { otpEmailHtml, otpEmailText } from "./emailTemplate";

/** 8 cryptographically random digits — not Math.random, this gates account access. */
function generateCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 10).toString()).join("");
}

/** Passwordless sign-in: email a code instead of checking a password. */
export const ResendOTP = Email({
  id: "resend-otp",
  maxAge: 60 * 20, // 20 minutes
  async generateVerificationToken() {
    return generateCode();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const normalized = email.toLowerCase().trim();
    // This runs before any account is created, so an unauthorized email
    // never even gets a code sent — matching the Password provider's
    // allowlist gate (see convex/auth.ts).
    if (!ALLOWED_EMAILS.includes(normalized)) {
      throw new ConvexError("This app is private. That email isn't authorized.");
    }

    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      throw new Error("AUTH_RESEND_KEY is not set; cannot send sign-in codes.");
    }
    const emailArgs = {
      heading: "Sign in to Mobu",
      subheading: "This code expires in 20 minutes.",
      code: token,
    };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Mobu <onboarding@resend.dev>",
        to: [normalized],
        subject: "Your Mobu sign-in code",
        html: otpEmailHtml(emailArgs),
        text: otpEmailText(emailArgs),
      }),
    });
    if (!res.ok) {
      throw new Error(`Could not send sign-in email: ${await res.text()}`);
    }
  },
});
