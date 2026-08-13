import { Email } from "@convex-dev/auth/providers/Email";
import { otpEmailHtml, otpEmailText } from "./emailTemplate";

/** 8 cryptographically random digits — not Math.random, this gates account access. */
function generateCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 10).toString()).join("");
}

export const ResendOTPPasswordReset = Email({
  id: "resend-otp-password-reset",
  maxAge: 60 * 20, // 20 minutes
  async generateVerificationToken() {
    return generateCode();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      throw new Error("AUTH_RESEND_KEY is not set; cannot send password reset emails.");
    }
    const emailArgs = {
      heading: "Reset your password",
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
        from: "Mobu <mobu@prismintelligence.in>",
        to: [email],
        subject: "Your Mobu password reset code",
        html: otpEmailHtml(emailArgs),
        text: otpEmailText(emailArgs),
      }),
    });
    if (!res.ok) {
      throw new Error(`Could not send password reset email: ${await res.text()}`);
    }
  },
});
