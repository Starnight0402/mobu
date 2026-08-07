import { query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db.query("insights").order("desc").collect();
  },
});
