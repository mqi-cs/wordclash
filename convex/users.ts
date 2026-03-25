import { internalMutation, mutation, query } from "./_generated/server";
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
      name: user.username ?? user.name ?? user.googleName,
      username: user.username,
      googleName: user.googleName,
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

    await ctx.db.patch(userId, { username });

    return { success: true };
  },
});

export const migrateLegacyNamesToUsername = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(200);
    let migratedToUsername = 0;
    let migratedToGoogleName = 0;

    for (const user of users) {
      const googleAccount = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id).eq("provider", "google"))
        .unique();

      if (!googleAccount && !user.username && user.name) {
        await ctx.db.patch(user._id, { username: user.name });
        migratedToUsername += 1;
      } else if (googleAccount && !user.googleName && user.name) {
        await ctx.db.patch(user._id, { googleName: user.name });
        migratedToGoogleName += 1;
      }
    }

    return {
      scanned: users.length,
      migratedToUsername,
      migratedToGoogleName,
    };
  },
});
