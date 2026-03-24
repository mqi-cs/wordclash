import { query } from "./_generated/server";
import { auth } from "./auth";

/**
 * Returns the currently authenticated user
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (userId === null) {
      return null;
    }
    const user = await ctx.db.get(userId);
    return user;
  },
});
