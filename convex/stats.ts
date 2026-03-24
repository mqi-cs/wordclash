import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

// Fetch leaderboard for a specific mode
export const getLeaderboard = query({
  args: { mode: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Validate mode
    const validModes = ["classic", "hard", "timed", "multiplayer"];
    if (!validModes.includes(args.mode)) {
      throw new Error("Invalid game mode");
    }

    const sortField = `${args.mode}_won` as string;

    // Supabase allowed ordering dynamically. In Convex, we can read all and manual sort for small datasets,
    // or add an index for each if large.
    const allStats = await ctx.db.query("userStats").collect();
    
    // Sort descending by mode_won
    const sorted = allStats.sort((a: any, b: any) => (b[sortField] || 0) - (a[sortField] || 0));
    
    const limited = sorted.slice(0, args.limit || 10);
    
    // Fetch usernames for the stats
    return await Promise.all(limited.map(async (stat) => {
      const user = await ctx.db.get(stat.userId);
      return {
        ...stat,
        username: user?.name || "Unknown User",
      };
    }));
  },
});

// Get stats for current user
export const getMyStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

// Update stats after a game
export const updateStats = mutation({
  args: {
    mode: v.union(v.literal("classic"), v.literal("hard"), v.literal("timed"), v.literal("multiplayer")),
    won: v.boolean(),
    greenLetters: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in to update stats");
    }

    const existingStats = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!existingStats) {
      // Initialize stats
      const newStats = {
        userId,
        classic_played: args.mode === "classic" ? 1 : 0,
        classic_won: args.mode === "classic" && args.won ? 1 : 0,
        hard_played: args.mode === "hard" ? 1 : 0,
        hard_won: args.mode === "hard" && args.won ? 1 : 0,
        timed_played: args.mode === "timed" ? 1 : 0,
        timed_won: args.mode === "timed" && args.won ? 1 : 0,
        multiplayer_played: args.mode === "multiplayer" ? 1 : 0,
        multiplayer_won: args.mode === "multiplayer" && args.won ? 1 : 0,
        current_streak: args.won ? 1 : 0,
        best_streak: args.won ? 1 : 0,
        total_green_letters: args.greenLetters,
      };
      await ctx.db.insert("userStats", newStats);
    } else {
      // Update existing stats
      const modePlayedField = `${args.mode}_played` as keyof typeof existingStats;
      const modeWonField = `${args.mode}_won` as keyof typeof existingStats;

      const newCurrentStreak = args.won ? (existingStats.current_streak || 0) + 1 : 0;
      const newBestStreak = Math.max(newCurrentStreak, existingStats.best_streak || 0);

      const updates: any = {
        [modePlayedField]: (existingStats[modePlayedField] as number || 0) + 1,
        current_streak: newCurrentStreak,
        best_streak: newBestStreak,
        total_green_letters: (existingStats.total_green_letters || 0) + args.greenLetters,
      };

      if (args.won) {
        updates[modeWonField] = (existingStats[modeWonField] as number || 0) + 1;
      }

      await ctx.db.patch(existingStats._id, updates);
    }
  },
});
