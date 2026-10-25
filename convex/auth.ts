import { ConvexError } from "convex/values";
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";
import { ResendOTP } from "./ResendOTP";
import { ALLOWED_EMAILS } from "./allowedEmails";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Plain `throw new Error(...)` gets redacted to a generic message on
      // production deployments -- ConvexError is what actually reaches the
      // client, which matters here since the whole point is a readable
      // "that email isn't allowed" message instead of a dead-end.
      profile(params) {
        const email = (params.email as string)?.toLowerCase().trim();
        if (!email || !ALLOWED_EMAILS.includes(email)) {
          throw new ConvexError("This app is private. That email isn't authorized.");
        }
        return { email };
      },
      reset: ResendOTPPasswordReset,
    }),
    ResendOTP,
  ],
  callbacks: {
    // By default Convex Auth only links a new sign-in method to an existing
    // user when that user's email is verified. Password sign-up never verifies
    // it, so signing in with an emailed code later created a SECOND user row
    // for the same person, which broke every "my partner" lookup for them.
    // Link by email instead, but only for sign-ins that prove the email
    // (codes); an unverified password sign-up for an email that already has
    // an account is refused, so it can't be used to get into that account.
    async createOrUpdateUser(ctx, { existingUserId, profile, type }) {
      const verified = profile.emailVerified === true || type === "email" || type === "verification";
      if (existingUserId) {
        if (verified) await ctx.db.patch(existingUserId, { emailVerificationTime: Date.now() });
        return existingUserId;
      }

      const email = typeof profile.email === "string" ? profile.email.toLowerCase().trim() : undefined;
      if (email) {
        const matches = await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("email"), email))
          .collect();
        const original = matches.sort((a, b) => a._creationTime - b._creationTime)[0];
        if (original) {
          if (!verified) {
            throw new ConvexError("An account with this email already exists. Sign in, or use an email code.");
          }
          await ctx.db.patch(original._id, { emailVerificationTime: Date.now() });
          return original._id;
        }
      }

      return await ctx.db.insert("users", {
        email,
        ...(verified ? { emailVerificationTime: Date.now() } : {}),
      });
    },
  },
});
