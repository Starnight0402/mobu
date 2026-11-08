import { query } from "../_generated/server";
import { coupleIds, coupleTimeZone, sharingLevels } from "./access";
import { flagFor, testFor } from "./labLogic";
import { runsOut, todayFor } from "./meds";
import { preventionOf } from "./prevention";
import { addDays, daysBetween, localDate } from "./time";

/*
 * "Health today" for the hub and the Home card: dose progress and the short
 * list of things that need attention, for both people, at each person's
 * sharing level.
 */

type Tone = "coral" | "gold" | "purple" | "sage";
interface Attention {
  key: string;
  ownerId: string;
  isMe: boolean;
  title: string;
  detail: string;
  tab: string;
  tone: Tone;
  label: string;
  rank: number;
}

export const today = query({
  args: {},
  handler: async (ctx) => {
    const { me, partner } = await coupleIds(ctx);
    const tz = await coupleTimeZone(ctx);
    const now = Date.now();
    const today = localDate(now, tz);
    const people = [{ userId: me, isMe: true }, ...(partner ? [{ userId: partner._id, isMe: false }] : [])];
    const levels = new Map([[me as string, null as null | Awaited<ReturnType<typeof sharingLevels>>]]);
    if (partner) levels.set(partner._id, await sharingLevels(ctx, partner._id));
    const can = (ownerId: string, cat: "records" | "meds" | "visits") => {
      const l = levels.get(ownerId);
      return !l || l[cat] !== "hidden";
    };
    const items: Attention[] = [];

    // Doses
    const medsReaders = people.filter((p) => can(p.userId, "meds"));
    const doses = await todayFor(ctx, medsReaders, tz);

    for (const p of people) {
      // Out-of-range labs (latest value per marker)
      if (can(p.userId, "records")) {
        const results = await ctx.db
          .query("labResults")
          .withIndex("by_owner_date", (q) => q.eq("ownerId", p.userId).gte("date", addDays(today, -400)))
          .collect();
        const targets = new Map(
          (await ctx.db.query("labTargets").withIndex("by_owner_code", (q) => q.eq("ownerId", p.userId)).collect()).map((t) => [t.code, t]),
        );
        const latest = new Map<string, (typeof results)[number]>();
        for (const r of results) {
          const prev = latest.get(r.code);
          if (!prev || r.date >= prev.date) latest.set(r.code, r);
        }
        for (const r of latest.values()) {
          const flag = flagFor(r.value, r.refLow, r.refHigh, targets.get(r.code)) ?? r.flag;
          if (flag !== "high" && flag !== "low" && flag !== "abnormal") continue;
          const name = r.code.startsWith("x:") ? r.name : testFor(r.code).name;
          items.push({
            key: `lab:${p.userId}:${r.code}`,
            ownerId: p.userId,
            isMe: p.isMe,
            title: `${name} is ${flag === "low" ? "below" : flag === "high" ? "above" : "outside"} range`,
            detail: `${r.value ?? r.valueText ?? ""} ${r.unit ?? ""} on ${r.date}`.trim(),
            tab: `health-labs`,
            tone: "coral",
            label: flag === "low" ? "Low" : flag === "high" ? "High" : "Check",
            rank: 2,
          });
        }
        if (p.isMe) {
          const pending = await ctx.db
            .query("healthRecords")
            .withIndex("by_owner_status", (q) => q.eq("ownerId", me).eq("status", "review"))
            .collect();
          if (pending.length) {
            items.push({
              key: "review",
              ownerId: me,
              isMe: true,
              title: `${pending.length} ${pending.length === 1 ? "report is" : "reports are"} waiting for you to check`,
              detail: "Values were read; nothing is saved until you confirm",
              tab: "health-records",
              tone: "gold",
              label: "Review",
              rank: 1,
            });
          }
        }
      }
      // Refills
      if (can(p.userId, "meds")) {
        const meds = (await ctx.db.query("medications").withIndex("by_owner", (q) => q.eq("ownerId", p.userId)).collect()).filter((m) => m.active);
        for (const m of meds) {
          const out = runsOut(m, today);
          if (out && daysBetween(today, out) <= 7) {
            items.push({
              key: `refill:${m._id}`,
              ownerId: p.userId,
              isMe: p.isMe,
              title: `${m.name} is running low`,
              detail: `${m.stockCount} left · runs out ${out === today ? "today" : out}`,
              tab: "health-meds",
              tone: "gold",
              label: "Refill",
              rank: 3,
            });
          }
        }
      }
      // Appointments in the next 3 days
      if (can(p.userId, "visits")) {
        const appts = await ctx.db
          .query("appointments")
          .withIndex("by_owner_start", (q) => q.eq("ownerId", p.userId).gte("start", now - 3_600_000).lte("start", now + 3 * 86_400_000))
          .collect();
        for (const a of appts) {
          if (a.status !== "upcoming") continue;
          const d = localDate(a.start, tz);
          const when = d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : d;
          const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(a.start);
          items.push({
            key: `appt:${a._id}`,
            ownerId: p.userId,
            isMe: p.isMe,
            title: `${a.title}, ${when.toLowerCase() === "today" || when === "Tomorrow" ? when.toLowerCase() : when} ${hm}`,
            detail: [a.doctor, a.fastingFrom ? "fasting needed" : null, a.companion ? "you're going together" : null].filter(Boolean).join(" · "),
            tab: `health-visits`,
            tone: "purple",
            label: "Prep",
            rank: 0,
          });
        }
      }
      if (p.isMe) {
        const prof = await ctx.db.query("healthProfiles").withIndex("by_owner", (q) => q.eq("ownerId", p.userId)).unique();
        if (!prof?.dob || !prof?.sexAtBirth) {
          items.push({
            key: "profile",
            ownerId: p.userId,
            isMe: true,
            title: "Add your date of birth and sex",
            detail: "So screenings and lab ranges match you",
            tab: "health-medid",
            tone: "purple",
            label: "Add",
            rank: 4,
          });
        }
      }
      // Prevention: due or overdue
      const prev = await preventionOf(ctx, p.userId, today);
      for (const x of [...prev.vaccines, ...prev.screenings]) {
        if (x.status !== "due" && x.status !== "overdue") continue;
        items.push({
          key: `prev:${p.userId}:${x.key}`,
          ownerId: p.userId,
          isMe: p.isMe,
          title: `${x.name} ${x.status === "overdue" ? "is overdue" : "is due"}`,
          detail: x.lastDone ? `Last done ${x.lastDone}` : x.detail,
          tab: "health-prevention",
          tone: x.status === "overdue" ? "coral" : "gold",
          label: x.status === "overdue" ? "Overdue" : "Due",
          rank: 5,
        });
      }
    }

    // Shared: care mode and the cabinet
    const care = (await ctx.db.query("episodes").withIndex("by_status", (q) => q.eq("status", "ongoing")).collect()).filter(
      (e) => e.careMode && people.some((p) => p.userId === e.ownerId),
    );
    for (const e of care) {
      items.push({
        key: `care:${e._id}`,
        ownerId: e.ownerId,
        isMe: e.ownerId === me,
        title: e.ownerId === me ? "Care mode is on for you" : "Care mode: looking after your partner",
        detail: e.title,
        tab: "health-care",
        tone: "coral",
        label: "Care",
        rank: -1,
      });
    }
    const month = today.slice(0, 7);
    const soon = addDays(today, 31).slice(0, 7);
    for (const c of await ctx.db.query("cabinetItems").collect()) {
      if (!c.expiry || c.expiry > soon) continue;
      items.push({
        key: `cab:${c._id}`,
        ownerId: me,
        isMe: true,
        title: `${c.name} ${c.expiry < month ? "has expired" : "expires soon"}`,
        detail: `Home cabinet · ${c.expiry}`,
        tab: "health-meds",
        tone: c.expiry < month ? "coral" : "gold",
        label: "Expiry",
        rank: 6,
      });
    }

    // Collapse identical "flu shot due" items for both into one.
    const merged: (Attention & { both?: boolean })[] = [];
    for (const it of items.sort((a, b) => a.rank - b.rank)) {
      const twin = merged.find((m) => m.title === it.title && m.ownerId !== it.ownerId && it.key.startsWith("prev:"));
      if (twin) twin.both = true;
      else merged.push(it);
    }

    const count = (isMe: boolean) => {
      const s = doses.slots.filter((x) => x.isMe === isMe);
      return { taken: s.filter((x) => x.status === "taken").length, total: s.length };
    };
    return {
      date: today,
      attention: merged,
      doses: doses.slots,
      doseCounts: { me: count(true), partner: count(false) },
    };
  },
});
