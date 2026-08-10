"use node";

import webpush from "web-push";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Web push delivery.
 *
 * Runs in Convex's Node runtime because `web-push` needs Node crypto to sign
 * the VAPID JWT and to do the aes128gcm payload encryption.
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

    const subscriptions = await ctx.runQuery(internal.pushSubscriptions.forUser, {
      userId: args.userId,
    });

    const payload = JSON.stringify({
      kind: args.kind,
      title: args.title,
      body: args.body,
      tab: args.tab ?? "home",
      urgent: args.urgent,
    });

    const stale: string[] = [];
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
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
            console.error("Push failed", status, (err as Error).message);
          }
        }
      }),
    );

    if (stale.length > 0) {
      await ctx.runMutation(internal.pushSubscriptions.pruneStale, { endpoints: stale });
    }
  },
});
