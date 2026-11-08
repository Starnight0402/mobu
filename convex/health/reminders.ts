import { internalMutation, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { displayName, partnerOf } from "../authHelpers";
import { notifyUser } from "../notify";
import { coupleTimeZone } from "./access";
import { DEFAULT_REMINDERS } from "./profile";
import { runsOut } from "./meds";
import { preventionOf } from "./prevention";
import { slotKey, slotsOn } from "./schedule";
import { addDays, daysBetween, localDate, localParts, localToUtc } from "./time";

/*
 * Health reminders, sent as normal Mobu notifications (in-app + push).
 *
 * tick (every 5 min): dose times, the missed-dose nudge to the partner,
 *   fasting starts, and appointments (evening before + 2 hours before).
 * daily (morning): refills, course endings, prevention due, insurance
 *   renewals and expiring medicines in the cabinet.
 *
 * Every reminder has a key in reminderLog so it's sent once, however the
 * windows overlap. Medicine names are left out of the lock screen text when
 * "hide details" is on (the default).
 */

async function once(ctx: MutationCtx, key: string): Promise<boolean> {
  const seen = await ctx.db.query("reminderLog").withIndex("by_key", (q) => q.eq("key", key)).first();
  if (seen) return false;
  await ctx.db.insert("reminderLog", { key, at: Date.now() });
  return true;
}

async function prefs(ctx: MutationCtx, userId: Id<"users">) {
  const p = await ctx.db.query("healthProfiles").withIndex("by_owner", (q) => q.eq("ownerId", userId)).unique();
  return p?.reminders ?? DEFAULT_REMINDERS;
}

async function users(ctx: MutationCtx) {
  return (await ctx.db.query("users").collect()).filter((u) => !!u.email);
}

export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tz = await coupleTimeZone(ctx);
    const now = Date.now();
    const today = localDate(now, tz);
    const yesterday = addDays(today, -1);
    for (const user of await users(ctx)) {
      const pr = await prefs(ctx, user._id);
      const partner = await partnerOf(ctx, user._id);
      const meds = (await ctx.db.query("medications").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect()).filter(
        (m) => m.active && m.schedule.type !== "prn",
      );
      for (const m of meds) {
        for (const date of [yesterday, today]) {
          for (const hm of slotsOn(m.schedule, date)) {
            const at = localToUtc(date, hm, tz);
            const slot = slotKey(date, hm);
            const logged = await ctx.db
              .query("doseLogs")
              .withIndex("by_med_slot", (q) => q.eq("medId", m._id).eq("slot", slot))
              .unique();
            if (logged) continue;
            // Due now (sent within 10 minutes of the time, never late-night catch-up spam).
            if (pr.doses && at <= now && at > now - 10 * 60_000 && (await once(ctx, `dose:${m._id}:${slot}`))) {
              await notifyUser(ctx, {
                userId: user._id,
                kind: "health",
                title: pr.hideDetails ? `Time for your ${hm} medicine` : `${m.name}${m.strength ? ` ${m.strength}` : ""}`,
                body: pr.hideDetails ? "Tap to mark it taken" : m.instructions ?? `Your ${hm} dose`,
                tab: "health-meds",
              });
            }
            // Still unmarked an hour later: a quiet nudge to the partner, without the medicine's name.
            if (m.nudgePartner && partner && at <= now - 60 * 60_000 && at > now - 3 * 3_600_000 && (await once(ctx, `miss:${m._id}:${slot}`))) {
              await notifyUser(ctx, {
                userId: partner._id,
                kind: "health",
                title: `${displayName(user)}'s ${hm} dose isn't marked yet`,
                body: "A gentle reminder might help",
                tab: "health-meds",
              });
            }
          }
        }
      }

      if (!pr.appointments) continue;
      const appts = await ctx.db
        .query("appointments")
        .withIndex("by_owner_start", (q) => q.eq("ownerId", user._id).gte("start", now).lte("start", now + 2 * 86_400_000))
        .collect();
      for (const a of appts) {
        if (a.status !== "upcoming") continue;
        const { hm } = localParts(a.start, tz);
        const d = localDate(a.start, tz);
        const nowLocal = localParts(now, tz);
        const toWhom = [user._id, ...(a.companion && partner ? [partner._id] : [])];
        if (d === addDays(today, 1) && nowLocal.hm >= "19:00" && (await once(ctx, `appt1d:${a._id}`))) {
          for (const uid of toWhom) {
            await notifyUser(ctx, {
              userId: uid,
              kind: "health",
              title: uid === user._id ? `Tomorrow ${hm}: ${a.title}` : `Tomorrow ${hm}: ${displayName(user)}'s ${a.title}`,
              body: [a.place, a.fastingFrom ? "Fasting needed" : null, a.bring.length ? `${a.bring.filter((b) => !b.done).length} things to take` : null].filter(Boolean).join(" · ") || "Open to prepare",
              tab: "health-visits",
            });
          }
        }
        if (a.start - now <= 2 * 3_600_000 && (await once(ctx, `appt2h:${a._id}`))) {
          for (const uid of toWhom) {
            await notifyUser(ctx, { userId: uid, kind: "health", title: `In 2 hours: ${a.title}`, body: a.place ?? a.doctor ?? "", tab: "health-visits" });
          }
        }
        if (a.fastingFrom && a.fastingFrom > now - 5 * 60_000 && a.fastingFrom - now <= 30 * 60_000 && (await once(ctx, `fast:${a._id}`))) {
          await notifyUser(ctx, {
            userId: user._id,
            kind: "health",
            title: `Fasting starts at ${localParts(a.fastingFrom, tz).hm}`,
            body: `For ${a.title}. Water is fine.`,
            tab: "health-visits",
          });
        }
      }
    }
  },
});

export const daily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tz = await coupleTimeZone(ctx);
    const today = localDate(Date.now(), tz);
    const all = await users(ctx);
    for (const user of all) {
      const pr = await prefs(ctx, user._id);
      const meds = (await ctx.db.query("medications").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect()).filter((m) => m.active);
      for (const m of meds) {
        const out = runsOut(m, today);
        if (pr.refills && out && daysBetween(today, out) <= 7 && (await once(ctx, `refill:${m._id}:${out}`))) {
          await notifyUser(ctx, {
            userId: user._id,
            kind: "health",
            title: pr.hideDetails ? "A medicine is running low" : `${m.name} is running low`,
            body: `About ${Math.max(0, daysBetween(today, out))} days left. Time to refill.`,
            tab: "health-meds",
          });
        }
        if (pr.doses && m.schedule.endDate === addDays(today, 1) && (await once(ctx, `course:${m._id}`))) {
          await notifyUser(ctx, {
            userId: user._id,
            kind: "health",
            title: pr.hideDetails ? "A course of medicine ends tomorrow" : `${m.name}: last day tomorrow`,
            body: "Check with your doctor if you were told to continue.",
            tab: "health-meds",
          });
        }
      }
      if (pr.prevention) {
        const prev = await preventionOf(ctx, user._id, today);
        for (const x of [...prev.vaccines, ...prev.screenings]) {
          if (x.status !== "due" && x.status !== "overdue") continue;
          // One reminder per due date, and again every 30 days while overdue.
          const bucket = x.dueOn ?? `${today.slice(0, 7)}`;
          if (await once(ctx, `prev:${user._id}:${x.key}:${bucket}:${Math.floor(Date.now() / (30 * 86_400_000))}`)) {
            await notifyUser(ctx, {
              userId: user._id,
              kind: "health",
              title: `${x.name} ${x.status === "overdue" ? "is overdue" : "is due"}`,
              body: x.detail,
              tab: "health-prevention",
            });
          }
        }
      }
    }

    // Household: insurance renewals and the cabinet go to both.
    const policies = (await ctx.db.query("insurancePolicies").collect()).filter((p) => p.active && p.renewal);
    for (const p of policies) {
      const days = daysBetween(today, p.renewal as string);
      if (days < 0 || days > 30) continue;
      for (const user of all) {
        if (!(await prefs(ctx, user._id)).renewals) continue;
        if (await once(ctx, `renew:${p._id}:${p.renewal}:${user._id}`)) {
          await notifyUser(ctx, { userId: user._id, kind: "health", title: `${p.insurer} renews in ${days} days`, body: `On ${p.renewal}. Compare before it auto-renews.`, tab: "health-insurance" });
        }
      }
    }
    const soon = addDays(today, 30).slice(0, 7);
    const expiring = (await ctx.db.query("cabinetItems").collect()).filter((c: Doc<"cabinetItems">) => c.expiry && c.expiry <= soon);
    for (const c of expiring) {
      for (const user of all) {
        if (!(await prefs(ctx, user._id)).renewals) continue;
        if (await once(ctx, `exp:${c._id}:${c.expiry}:${user._id}`)) {
          await notifyUser(ctx, { userId: user._id, kind: "health", title: `${c.name} expires ${c.expiry}`, body: "In the home medicine cabinet", tab: "health-meds" });
        }
      }
    }

    // Keep the log small: anything older than 60 days can't be sent again anyway.
    const old = await ctx.db.query("reminderLog").order("asc").take(500);
    for (const r of old) if (r.at < Date.now() - 60 * 86_400_000) await ctx.db.delete(r._id);
  },
});
