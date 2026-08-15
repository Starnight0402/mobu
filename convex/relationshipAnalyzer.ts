import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./authHelpers";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// A chunk per Groq call; cap keeps very long (multi-year) exports to a
// bounded number of calls instead of one per ~14k characters of chat.
const MAX_CHUNKS = 20;

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("relationshipAnalyses").order("desc").take(10);
  },
});

export const startAnalysis = mutation({
  args: { chatStorageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const id = await ctx.db.insert("relationshipAnalyses", {
      requestedBy: userId,
      status: "processing",
    });
    // Scheduled rather than awaited so the client gets the row back
    // immediately and watches it finish via the reactive `list` query,
    // instead of holding one request open for however long Groq takes.
    await ctx.scheduler.runAfter(0, internal.relationshipAnalyzer.runAnalysis, {
      id,
      chatStorageId: args.chatStorageId,
    });
    return id;
  },
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
    const nameOf = (id: (typeof users)[number]["_id"] | undefined) =>
      users.find((u) => u._id === id)?.name || "unspecified";

    const lines: string[] = [];
    lines.push(`Memories logged: ${memories.length}`);
    for (const m of memories.slice(-15)) {
      lines.push(`- Memory: "${m.title}" (${m.category})${m.description ? " — " + m.description : ""}`);
    }
    lines.push(`Goals: ${goals.length} (${goals.filter((g) => g.completed).length} completed)`);
    for (const g of goals) {
      lines.push(`- Goal: "${g.title}" [${g.category}] ${g.current}/${g.target}${g.completed ? " (done)" : ""}`);
    }
    if (moods.length > 0) {
      const avg = moods.reduce((s, m) => s + m.value, 0) / moods.length;
      lines.push(`Average logged mood: ${avg.toFixed(1)}/10 across ${moods.length} entries`);
    }

    // Fights are logged directly by the couple (not inferred from chat), so
    // they're the most reliable signal the model gets for conflict patterns.
    lines.push(`Fights logged: ${fights.length} (${fights.filter((f) => f.resolved).length} marked resolved)`);
    for (const f of fights.slice(0, 30)) {
      const when = new Date(f.fightDate ?? f._creationTime).toISOString().slice(0, 10);
      lines.push(
        `- Fight [${when}] severity ${f.severity}/5, initiated by ${nameOf(f.initiatedBy)}, ${
          f.resolved ? `resolved (${f.resolution || "no note"})` : "unresolved"
        }: ${f.description}`,
      );
    }
    return lines.join("\n");
  },
});

export const saveResult = internalMutation({
  args: {
    id: v.id("relationshipAnalyses"),
    status: v.union(v.literal("done"), v.literal("error")),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    messageCount: v.optional(v.number()),
    sampled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      result: args.result,
      error: args.error,
      messageCount: args.messageCount,
      sampled: args.sampled,
    });
  },
});

export const runAnalysis = internalAction({
  args: { id: v.id("relationshipAnalyses"), chatStorageId: v.id("_storage") },
  handler: async (ctx, args) => {
    try {
      const blob = await ctx.storage.get(args.chatStorageId);
      if (!blob) throw new Error("Uploaded chat file not found");
      const raw = await blob.text();
      const messages = parseWhatsApp(raw);
      if (messages.length === 0) {
        throw new Error(
          "Couldn't find any WhatsApp messages in that file. In WhatsApp, use Chat > More > Export chat > Without Media, then upload the .txt file it produces.",
        );
      }

      let chunks = chunkMessages(messages);
      const sampled = chunks.length > MAX_CHUNKS;
      if (sampled) chunks = sampleEvenly(chunks, MAX_CHUNKS);

      const chunkSummaries = chunks.length === 1 ? chunks : await summarizeChunks(chunks);

      const appContext: string = await ctx.runQuery(internal.relationshipAnalyzer.getAppContext, {});

      const finalRaw = await callGroq(
        [
          {
            role: "system",
            content:
              "You are a thoughtful, honest relationship analyst. Given chronological summaries of a couple's WhatsApp chat history plus data from their shared relationship-tracking app (including a log of fights they recorded themselves, with severity, who initiated, and resolution status), produce a warm but candid analysis grounded only in what's given. Respond with ONLY valid JSON, no markdown, matching exactly: " +
              `{"overallScore": number, "headline": string, "strengths": string[], "growthAreas": string[], "communicationPatterns": string[], "conflictPatterns": string[], "trendsOverTime": string[], "suggestions": string[]}` +
              " overallScore is 1-10. conflictPatterns should draw specifically on the logged fights (frequency, severity trend, who tends to initiate, how often they get resolved vs. linger) — say there's not enough data yet if fewer than 2 fights are logged. Each array holds 3-5 concise, specific, non-generic items grounded in the actual content given.",
          },
          {
            role: "user",
            content: `CHAT HISTORY SUMMARIES (chronological order):\n${chunkSummaries.join("\n\n---\n\n")}\n\nAPP DATA:\n${appContext}`,
          },
        ],
        true,
      );

      await ctx.runMutation(internal.relationshipAnalyzer.saveResult, {
        id: args.id,
        status: "done",
        result: finalRaw,
        messageCount: messages.length,
        sampled,
      });
    } catch (err) {
      await ctx.runMutation(internal.relationshipAnalyzer.saveResult, {
        id: args.id,
        status: "error",
        error: (err as Error).message,
      });
    }
  },
});

async function summarizeChunks(chunks: string[]): Promise<string[]> {
  const results: string[] = new Array(chunks.length);
  const concurrency = 4; // stays comfortably under Groq's free-tier RPM limit
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((chunk) =>
        callGroq([
          {
            role: "system",
            content:
              "Summarize this segment of a couple's WhatsApp chat log in 4-6 short bullet points: dominant topics, emotional tone, any conflict or tension, affection shown, and notable plans/events. Be concrete and specific. Plain text bullets only, no markdown headers.",
          },
          { role: "user", content: chunk },
        ]),
      ),
    );
    batchResults.forEach((r, j) => (results[i + j] = r));
  }
  return results;
}

async function callGroq(messages: { role: string; content: string }[], jsonMode = false): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured on the server");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.4,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response");
  return content;
}

interface ParsedMessage {
  date: string;
  time: string;
  sender: string;
  text: string;
}

// Matches both Android ("12/4/24, 9:41 PM - Name: text") and iOS
// ("[12/4/24, 9:41:02 PM] Name: text") WhatsApp export line formats.
const WHATSAPP_LINE_RE =
  /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s*-?\s*([^:]+):\s(.*)$/;

function parseWhatsApp(raw: string): ParsedMessage[] {
  const lines = raw.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/‎/g, "");
    const m = cleaned.match(WHATSAPP_LINE_RE);
    if (m) {
      messages.push({ date: m[1], time: m[2], sender: m[3].trim(), text: m[4] });
    } else if (messages.length > 0 && cleaned.trim()) {
      // Continuation of a multi-line message (no timestamp prefix).
      messages[messages.length - 1].text += "\n" + cleaned;
    }
  }
  return messages;
}

function chunkMessages(messages: ParsedMessage[], maxChars = 14000): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let len = 0;
  for (const m of messages) {
    const line = `[${m.date} ${m.time}] ${m.sender}: ${m.text}`;
    if (len + line.length > maxChars && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
      len = 0;
    }
    current.push(line);
    len += line.length + 1;
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}

// Spreads a fixed sample across the whole timeline (not just the tail) so a
// years-long export still gets beginning/middle/end coverage.
function sampleEvenly<T>(arr: T[], count: number): T[] {
  if (arr.length <= count) return arr;
  const result: T[] = [];
  const step = (arr.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}
