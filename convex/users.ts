import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
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

export const completeProfile = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (userId === null) {
      throw new Error("Unauthorized");
    }

    const username = args.username.trim();
    if (username.length < 3 || username.length > 20) {
      throw new Error("Username must be between 3 and 20 characters");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error("Username can only contain letters, numbers, underscores, and hyphens");
    }

    await ctx.db.patch(userId, { name: username });

    return { success: true };
  },
});
