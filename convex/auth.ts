import { ConvexError } from "convex/values";
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

// The only two people allowed to have an account in this app. Enforced
// server-side in the `profile` callback below, which runs on every
// signUp/signIn/reset flow — not just hidden in the UI.
const ALLOWED_EMAILS = ["amritanshuprasad1@gmail.com", "swati07rs@gmail.com"];

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
    }),
  ],
});
