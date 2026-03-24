import { query } from "./_generated/server";
import { auth } from "./auth";

/**
 * Returns the currently authenticated user — only safe fields
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (userId === null) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) return null;

    // Return only the fields the client actually needs
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
    };
  },
});
