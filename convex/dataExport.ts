import { query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

// Everything in one payload for the "download all our data" safety net --
// Convex is the sole source of truth for this data, so a personal backup
// matters more here than in a typical app.
export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const [memories, tracking, expenses, goals, capsules, messages] = await Promise.all([
      ctx.db.query("memories").collect(),
      ctx.db.query("tracking").collect(),
      ctx.db.query("expenses").collect(),
      ctx.db.query("goals").collect(),
      ctx.db.query("capsules").collect(),
      ctx.db.query("messages").collect(),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      memories: memories.map((m) => ({ ...m, imageStorageId: undefined })),
      tracking,
      expenses,
      goals,
      capsules,
      messages: messages.map((m) => ({ ...m, imageStorageId: undefined, voiceStorageId: undefined })),
    };
  },
});
