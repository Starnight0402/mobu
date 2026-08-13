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
});
