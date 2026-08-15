import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./authHelpers";
import {
  computeChatStats,
  detectConflicts,
  detectConnection,
  parseWhatsApp,
  type ChatStats,
  type ConflictEpisode,
  type ParsedMessage,
} from "./chatAnalysis";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Convex mutations get ~1 second of execution time, which binds well before
// the 16k-doc transaction ceiling does. 500 small inserts sits comfortably
// inside it with room to spare.
const INSERT_BATCH = 500;
const DELETE_BATCH = 500;

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export const latestImport = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const imports = await ctx.db.query("chatImports").order("desc").take(1);
    const latest = imports[0];
    if (!latest) return null;

    const episodes =
      latest.status === "done"
        ? await ctx.db
            .query("conflictEpisodes")
            .withIndex("by_import", (q) => q.eq("importId", latest._id))
            .collect()
        : [];

    return {
      ...latest,
      episodes: episodes
        .sort((a, b) => b.startedAt - a.startedAt)
        .map((e) => ({
          ...e,
          excerpts: JSON.parse(e.excerpts) as Array<{ sender: string; text: string; at: number }>,
          context: JSON.parse(e.context) as ConflictEpisode["context"],
        })),
    };
  },
});

export const importHistory = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("chatImports").order("desc").take(8);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("relationshipAnalyses").order("desc").take(5);
  },
});

/* ------------------------------------------------------------------ *
 * Kickoff
 * ------------------------------------------------------------------ */

export const startAnalysis = mutation({
  args: { chatStorageId: v.id("_storage"), fileName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const importId = await ctx.db.insert("chatImports", {
      requestedBy: userId,
      status: "processing",
      fileName: args.fileName,
    });
    // Scheduled rather than awaited: parsing 15k messages and calling Groq
    // takes far longer than a mutation may run, and the client watches the row
    // reactively anyway.
    await ctx.scheduler.runAfter(0, internal.relationshipAnalyzer.runImport, {
      importId,
      chatStorageId: args.chatStorageId,
    });
    return importId;
  },
});

/* ------------------------------------------------------------------ *
 * Internal helpers the action calls
 * ------------------------------------------------------------------ */

export const insertMessageBatch = internalMutation({
  args: {
    importId: v.id("chatImports"),
    batch: v.array(
      v.object({
        sender: v.string(),
        text: v.string(),
        sentAt: v.number(),
        isMedia: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const m of args.batch) {
      await ctx.db.insert("chatMessages", { importId: args.importId, ...m });
    }
  },
});

/**
 * Deletes one page of chat messages, optionally scoped to a single import.
 * Returns how many it removed so the action can loop until it's drained --
 * paginating rather than collecting every id up front, which matters once a
 * multi-year export pushes this past six figures.
 */
export const deleteMessagePage = internalMutation({
  args: { importId: v.optional(v.id("chatImports")) },
  handler: async (ctx, args) => {
    const rows = args.importId
      ? await ctx.db
          .query("chatMessages")
          .withIndex("by_import", (q) => q.eq("importId", args.importId!))
          .take(DELETE_BATCH)
      : await ctx.db.query("chatMessages").take(DELETE_BATCH);
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});

export const deleteEpisodesFor = internalMutation({
  args: { importId: v.optional(v.id("chatImports")) },
  handler: async (ctx, args) => {
    const rows = args.importId
      ? await ctx.db
          .query("conflictEpisodes")
          .withIndex("by_import", (q) => q.eq("importId", args.importId!))
          .collect()
      : await ctx.db.query("conflictEpisodes").collect();
    for (const r of rows) await ctx.db.delete(r._id);
  },
});

export const saveEpisodes = internalMutation({
  args: {
    importId: v.id("chatImports"),
    episodes: v.array(
      v.object({
        kind: v.union(v.literal("conflict"), v.literal("connection")),
        date: v.string(),
        startedAt: v.number(),
        endedAt: v.number(),
        score: v.number(),
        severity: v.number(),
        topic: v.string(),
        messageCount: v.number(),
        openedBy: v.optional(v.string()),
        closedBy: v.optional(v.string()),
        repaired: v.boolean(),
        excerpts: v.string(),
        context: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const e of args.episodes) {
      await ctx.db.insert("conflictEpisodes", { importId: args.importId, ...e });
    }
  },
});

export const finishImport = internalMutation({
  args: {
    importId: v.id("chatImports"),
    status: v.union(v.literal("done"), v.literal("error")),
    stats: v.optional(v.string()),
    error: v.optional(v.string()),
    messageCount: v.optional(v.number()),
    dateRangeStart: v.optional(v.number()),
    dateRangeEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { importId, ...rest } = args;
    await ctx.db.patch(importId, rest);
  },
});

export const saveAnalysis = internalMutation({
  args: {
    importId: v.id("chatImports"),
    requestedBy: v.id("users"),
    status: v.union(v.literal("done"), v.literal("error")),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("relationshipAnalyses", {
      chatImportId: args.importId,
      requestedBy: args.requestedBy,
      status: args.status,
      result: args.result,
      error: args.error,
    });
  },
});

export const getImport = internalQuery({
  args: { importId: v.id("chatImports") },
  handler: async (ctx, args) => await ctx.db.get(args.importId),
});

export const getAppContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const memories = await ctx.db.query("memories").collect();
    const goals = await ctx.db.query("goals").collect();
    const tracking = await ctx.db.query("tracking").collect();
    const fights = await ctx.db.query("fights").collect();
    const users = await ctx.db.query("users").collect();
    const moods = tracking.filter((t) => t.type === "mood");
    const nameOf = (id?: (typeof users)[number]["_id"]) =>
      users.find((u) => u._id === id)?.name || "unspecified";

    const lines: string[] = [];
    lines.push(`Memories logged: ${memories.length}`);
    for (const m of memories.slice(-10)) {
      lines.push(`- Memory: "${m.title}" (${m.category})`);
    }
    // Every list here is capped: this digest is now stacked with a stats
    // summary and chat excerpts in a single prompt, and an uncapped loop is an
    // easy way to quietly regrow a token problem.
    lines.push(`Goals: ${goals.length} (${goals.filter((g) => g.completed).length} completed)`);
    for (const g of goals.slice(0, 10)) {
      lines.push(`- Goal: "${g.title}" [${g.category}] ${g.current}/${g.target}`);
    }
    if (moods.length > 0) {
      const avg = moods.reduce((s, m) => s + m.value, 0) / moods.length;
      lines.push(`Average logged mood: ${avg.toFixed(1)}/10 across ${moods.length} entries`);
    }
    lines.push(
      `Hand-logged fights: ${fights.length} (${fights.filter((f) => f.resolved).length} resolved)`,
    );
    for (const f of fights.slice(0, 15)) {
      const when = new Date(f.fightDate ?? f._creationTime).toISOString().slice(0, 10);
      lines.push(
        `- Fight [${when}] sev ${f.severity}/5${f.topic ? ` about ${f.topic}` : ""}, started by ${nameOf(f.initiatedBy)}, ${f.resolved ? "resolved" : "unresolved"}: ${f.description.slice(0, 120)}`,
      );
    }
    return lines.join("\n");
  },
});

/* ------------------------------------------------------------------ *
 * The import pipeline
 * ------------------------------------------------------------------ */

export const runImport = internalAction({
  args: { importId: v.id("chatImports"), chatStorageId: v.id("_storage") },
  handler: async (ctx, args) => {
    try {
      const blob = await ctx.storage.get(args.chatStorageId);
      if (!blob) throw new Error("Uploaded chat file not found");
      const raw = await blob.text();

      const messages: ParsedMessage[] = parseWhatsApp(raw);
      if (messages.length === 0) {
        throw new Error(
          "No WhatsApp messages found in that file. In WhatsApp use Chat > More > Export chat > Without Media, then upload the .txt it produces.",
        );
      }

      // Everything is computed from the in-memory array before a single row is
      // written, so the stats pass never pays for reading 15k rows back.
      const stats: ChatStats = computeChatStats(messages);
      const episodes: ConflictEpisode[] = [
        ...detectConflicts(messages, stats),
        ...detectConnection(messages, stats),
      ];

      // WhatsApp exports are always full-history, so an import replaces rather
      // than appends.
      await ctx.runMutation(internal.relationshipAnalyzer.deleteEpisodesFor, {});
      let removed = 0;
      do {
        removed = await ctx.runMutation(internal.relationshipAnalyzer.deleteMessagePage, {});
      } while (removed === DELETE_BATCH);

      for (let i = 0; i < messages.length; i += INSERT_BATCH) {
        await ctx.runMutation(internal.relationshipAnalyzer.insertMessageBatch, {
          importId: args.importId,
          batch: messages.slice(i, i + INSERT_BATCH),
        });
      }

      await ctx.runMutation(internal.relationshipAnalyzer.saveEpisodes, {
        importId: args.importId,
        episodes: episodes.map((e) => ({
          kind: e.kind,
          date: e.date,
          startedAt: e.startedAt,
          endedAt: e.endedAt,
          score: e.score,
          severity: e.severity,
          topic: e.topic,
          messageCount: e.messageCount,
          openedBy: e.openedBy,
          closedBy: e.closedBy,
          repaired: e.repaired,
          excerpts: JSON.stringify(e.excerpts),
          context: JSON.stringify(e.context),
        })),
      });

      await ctx.runMutation(internal.relationshipAnalyzer.finishImport, {
        importId: args.importId,
        status: "done",
        stats: JSON.stringify(stats),
        messageCount: messages.length,
        dateRangeStart: stats.dateRange.start,
        dateRangeEnd: stats.dateRange.end,
      });

      // The narrative is a bonus layer on top of real numbers -- if Groq is
      // down or rate-limited, the dashboard is still fully populated, so this
      // failing must not fail the import.
      try {
        await generateNarrative(ctx, args.importId, stats, episodes);
      } catch (err) {
        console.error("Narrative generation failed", (err as Error).message);
        const imp = await ctx.runQuery(internal.relationshipAnalyzer.getImport, {
          importId: args.importId,
        });
        if (imp) {
          await ctx.runMutation(internal.relationshipAnalyzer.saveAnalysis, {
            importId: args.importId,
            requestedBy: imp.requestedBy,
            status: "error",
            error: (err as Error).message,
          });
        }
      }
    } catch (err) {
      // A failure partway through leaves orphaned rows that the next import's
      // "replace everything" step wouldn't catch, so clean up after ourselves.
      let removed = 0;
      do {
        removed = await ctx.runMutation(internal.relationshipAnalyzer.deleteMessagePage, {
          importId: args.importId,
        });
      } while (removed === DELETE_BATCH);
      await ctx.runMutation(internal.relationshipAnalyzer.deleteEpisodesFor, {
        importId: args.importId,
      });
      await ctx.runMutation(internal.relationshipAnalyzer.finishImport, {
        importId: args.importId,
        status: "error",
        error: (err as Error).message,
      });
    }
  },
});

async function generateNarrative(
  ctx: { runQuery: any; runMutation: any },
  importId: string,
  stats: ChatStats,
  episodes: ConflictEpisode[],
) {
  const appContext: string = await ctx.runQuery(internal.relationshipAnalyzer.getAppContext, {});
  const imp = await ctx.runQuery(internal.relationshipAnalyzer.getImport, { importId });
  if (!imp) return;

  const [a, b] = stats.senders;
  const digest: string[] = [];
  digest.push(
    `${stats.totalMessages} messages over ${stats.daysCovered} days (avg ${stats.avgPerDay}/day).`,
  );
  for (const s of stats.senders) {
    const x = stats.bySender[s];
    const r = stats.responseTimes[s];
    digest.push(
      `${s}: ${x.messages} msgs, ${x.words} words, avg length ${x.avgMessageLength} chars, ${(x.questionRate * 100).toFixed(1)}% questions, ${x.longMessages} long messages, replies avg ${r.avgMinutes}m (median ${r.medianMinutes}m), started ${stats.initiations[s]} conversations, ${stats.doubleTexts[s]} consecutive messages.`,
    );
    digest.push(`${s} top words: ${stats.topWords[s].map(([w, n]) => `${w}(${n})`).join(", ")}`);
    const t = stats.tone?.[s];
    const lm = stats.languageMix?.[s];
    if (t) {
      digest.push(
        `${s} tone markers (bilingual English+Hindi lexicon): affection ${t.affection}, repair/apology ${t.repair}, distress ${t.distress}, blame/accusation ${t.accusation}, hurt ${t.hurt}, suspicion ${t.trust}.`,
      );
    }
    if (lm) {
      digest.push(
        `${s} writes ${(lm.hinglishShare * 100).toFixed(1)}% Hindi; top Hindi words: ${lm.topHindi.map(([w, n]) => `${w}(${n})`).join(", ") || "none"}.`,
      );
    }
  }
  digest.push(
    `Longest streak both texted: ${stats.streaks.longest} days (current ${stats.streaks.current}). Longest silence: ${stats.longestSilence.hours}h.`,
  );

  const conflicts = episodes.filter((e) => e.kind === "conflict");
  const connections = episodes.filter((e) => e.kind === "connection");

  const topicCounts = new Map<string, number>();
  for (const e of conflicts) topicCounts.set(e.topic, (topicCounts.get(e.topic) ?? 0) + 1);
  digest.push(
    `\n${conflicts.length} conflict episodes detected in the chat. By topic: ${[...topicCounts.entries()].map(([t, n]) => `${t} ${n}`).join(", ")}.`,
  );
  for (const e of conflicts.slice(0, 8)) {
    digest.push(
      `- ${e.date} (${e.context.days}d, severity ${e.severity}/5, topic ${e.topic}, opened by ${e.openedBy ?? "?"}, ${e.repaired ? `repaired by ${e.closedBy}` : "no clear repair"}): ` +
        e.excerpts
          .slice(0, 3)
          .map((x) => `${x.sender}: "${x.text.slice(0, 180)}"`)
          .join(" | "),
    );
  }

  // The good stretches are given equal weight in the prompt. Fed only the
  // fights, the model reliably writes a bleaker read than the data supports.
  digest.push(
    `\n${connections.length} deep connection moments detected: long, warm, two-sided stretches with no conflict in them.`,
  );
  for (const e of connections.slice(0, 8)) {
    const signals = (e.context.signals ?? []).join(", ");
    digest.push(
      `- ${e.date} (${e.messageCount} messages over ${Math.max(1, Math.round((e.endedAt - e.startedAt) / 3600000))}h${signals ? `, ${signals}` : ""}): ` +
        e.excerpts
          .slice(0, 3)
          .map((x) => `${x.sender}: "${x.text.slice(0, 180)}"`)
          .join(" | "),
    );
  }

  const system =
    "You are a perceptive, honest relationship analyst. You are given real computed statistics from a couple's WhatsApp history, real detected conflict episodes with verbatim excerpts, and data from their shared tracking app. " +
    `The two people are named "${a}" and "${b}" -- use these exact names. ` +
    "Ground every claim in the specific numbers or quotes given; cite the figure inline (e.g. \"replies in 4.7m vs 5.6m\"). Never invent events. Be warm but direct, and say the uncomfortable thing when the data supports it. " +
    "Respond with ONLY valid JSON matching exactly: " +
    `{"overallScore":number,"headline":string,"strengths":[{"point":string,"evidence":string}],"growthAreas":[{"point":string,"evidence":string}],"communicationPatterns":[{"point":string,"evidence":string}],"conflictPatterns":[{"point":string,"evidence":string}],"perPerson":{"<name>":{"behaviour":[string],"suggestions":[string]},"<other name>":{"behaviour":[string],"suggestions":[string]}},"together":[string]}` +
    ` Use "${a}" and "${b}" as the two keys inside perPerson. ` +
    "3-5 items per array. `evidence` is the specific stat or quote the point rests on, kept short. `behaviour` is 3-4 observations about how that person specifically shows up. `suggestions` is 2-3 concrete things that person could do differently.";

  const content = await callGroq([
    { role: "system", content: system },
    {
      role: "user",
      content: `CHAT STATISTICS\n${digest.join("\n")}\n\nAPP DATA\n${appContext}`,
    },
  ]);

  await ctx.runMutation(internal.relationshipAnalyzer.saveAnalysis, {
    importId,
    requestedBy: imp.requestedBy,
    status: "done",
    result: content,
  });
}

async function callGroq(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured on the server");

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.5,
        response_format: { type: "json_object" },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Groq returned an empty response");
      return content;
    }

    const text = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      const wait = text.match(/try again in ([\d.]+)s/i);
      await new Promise((r) =>
        setTimeout(r, wait ? Math.ceil(parseFloat(wait[1]) * 1000) + 750 : attempt * 4000),
      );
      continue;
    }
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 200)}`);
  }
  throw new Error("Groq rate limit persisted after retries");
}
