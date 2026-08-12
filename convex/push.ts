"use node";

import webpush from "web-push";
import { GoogleAuth } from "google-auth-library";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Push delivery, fanned out to whichever transport each device registered
 * under: browsers/PWA installs use Web Push, the Android APK uses FCM.
 *
 * Runs in Convex's Node runtime because `web-push` needs Node crypto to sign
 * the VAPID JWT and do the aes128gcm payload encryption, and the FCM OAuth2
 * token exchange needs `google-auth-library`.
 */
export const send = internalAction({
  args: {
    userId: v.id("users"),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    tab: v.optional(v.string()),
    urgent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.runQuery(internal.pushSubscriptions.forUser, {
      userId: args.userId,
    });
    const webSubs = subscriptions.filter((s) => !s.fcmToken && s.p256dh && s.auth);
    const fcmSubs = subscriptions.filter((s) => s.fcmToken);

    const stale: string[] = [];

    await Promise.all([
      sendWebPush(webSubs, args, stale),
      sendFcm(fcmSubs, args, stale),
    ]);

    if (stale.length > 0) {
      await ctx.runMutation(internal.pushSubscriptions.pruneStale, { endpoints: stale });
    }
  },
});

type NotifyArgs = {
  kind: string;
  title: string;
  body: string;
  tab?: string;
  urgent: boolean;
};

async function sendWebPush(
  subs: Array<{ endpoint: string; p256dh?: string; auth?: string }>,
  args: NotifyArgs,
  stale: string[],
) {
  if (subs.length === 0) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    // Not configured yet — the in-app notification row was still written, so
    // badges and the notification list work regardless.
    console.warn("VAPID keys are not set; skipping web push");
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:notifications@mobu.app",
    publicKey,
    privateKey,
  );

  const payload = JSON.stringify({
    kind: args.kind,
    title: args.title,
    body: args.body,
    tab: args.tab ?? "home",
    urgent: args.urgent,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh!, auth: sub.auth! },
          },
          payload,
          {
            // Calls need to cut through; everything else can wait for the
            // next time the device wakes its radio.
            urgency: args.urgent ? "high" : "normal",
            TTL: args.urgent ? 30 : 60 * 60 * 24,
          },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw this subscription away.
        if (status === 404 || status === 410) {
          stale.push(sub.endpoint);
        } else {
          console.error("Web push failed", status, (err as Error).message);
        }
      }
    }),
  );
}

let cachedFcmAuth: GoogleAuth | null = null;

function fcmAuth(): GoogleAuth | null {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;

  if (!cachedFcmAuth) {
    cachedFcmAuth = new GoogleAuth({
      credentials: {
        client_email: clientEmail,
        // Convex env vars are single-line, so the PEM's newlines are stored
        // escaped and restored here.
        private_key: privateKey.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
  }
  return cachedFcmAuth;
}

async function sendFcm(
  subs: Array<{ endpoint: string; fcmToken?: string }>,
  args: NotifyArgs,
  stale: string[],
) {
  if (subs.length === 0) return;

  const projectId = process.env.FCM_PROJECT_ID;
  const auth = fcmAuth();
  if (!auth || !projectId) {
    console.warn("FCM service account is not set; skipping native push");
    return;
  }

  const client = await auth.getClient();
  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) {
    console.error("Could not obtain an FCM access token");
    return;
  }

  await Promise.all(
    subs.map(async (sub) => {
      if (!sub.fcmToken) return;
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: sub.fcmToken,
                notification: { title: args.title, body: args.body },
                data: {
                  kind: args.kind,
                  tab: args.tab ?? "home",
                },
                android: {
                  priority: args.urgent ? "high" : "normal",
                },
              },
            }),
          },
        );
        if (!res.ok) {
          const errBody = await res.text();
          // UNREGISTERED/NOT_FOUND mean the app uninstalled or the token rotated.
          if (res.status === 404 || errBody.includes("UNREGISTERED")) {
            stale.push(sub.endpoint);
          } else {
            console.error("FCM push failed", res.status, errBody);
          }
        }
      } catch (err) {
        console.error("FCM push failed", (err as Error).message);
      }
    }),
  );
}
