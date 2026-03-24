import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

// Fetch leaderboard — bounded scan with take()
export const getLeaderboard = query({
  args: { mode: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const validModes = ["classic", "hard", "timed", "multiplayer"];
    if (!validModes.includes(args.mode)) {
      throw new Error("Invalid game mode");
    }

    const sortField = `${args.mode}_won` as string;
    const maxResults = Math.min(args.limit || 10, 50); // Cap at 50

    // Bounded: take at most 200 entries to sort through
    const stats = await ctx.db.query("userStats").take(200);
    
    const sorted = stats.sort((a: any, b: any) => (b[sortField] || 0) - (a[sortField] || 0));
    const limited = sorted.slice(0, maxResults);
    
    return await Promise.all(limited.map(async (stat) => {
      const user = await ctx.db.get(stat.userId);
      return {
        userId: stat.userId,
        username: user?.name || "Unknown User",
        [`${args.mode}_won`]: (stat as any)[sortField] || 0,
        [`${args.mode}_played`]: (stat as any)[`${args.mode}_played`] || 0,
        best_streak: stat.best_streak,
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

// Update stats after a game — server-derived for multiplayer
export const updateStats = mutation({
  args: {
    mode: v.union(v.literal("classic"), v.literal("hard"), v.literal("timed"), v.literal("multiplayer")),
    won: v.boolean(),
    greenLetters: v.number(),
    gameId: v.optional(v.id("games")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in to update stats");
    }

    let won = args.won;
    let greenLetters = args.greenLetters;

    // For multiplayer, verify the result from actual game data
    if (args.mode === "multiplayer" && args.gameId) {
      const game = await ctx.db.get(args.gameId);
      if (!game || game.status !== "finished") {
        throw new Error("Game is not finished");
      }
      if (game.player1Id !== userId && game.player2Id !== userId) {
        throw new Error("You are not part of this game");
      }
      // Derive the actual result from the game, not from client claims
      won = game.winnerId === userId;

      // Count actual green letters from guesses
      const myGuesses = await ctx.db
        .query("guesses")
        .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId!).eq("playerId", userId))
        .collect();
      greenLetters = myGuesses.reduce((total, g) => {
        return total + g.evaluation.filter(e => e === "correct").length;
      }, 0);
    }

    // Clamp greenLetters to reasonable bounds for single-player modes
    greenLetters = Math.min(Math.max(greenLetters, 0), 30);

    const existingStats = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!existingStats) {
      const newStats = {
        userId,
        classic_played: args.mode === "classic" ? 1 : 0,
        classic_won: args.mode === "classic" && won ? 1 : 0,
        hard_played: args.mode === "hard" ? 1 : 0,
        hard_won: args.mode === "hard" && won ? 1 : 0,
        timed_played: args.mode === "timed" ? 1 : 0,
        timed_won: args.mode === "timed" && won ? 1 : 0,
        multiplayer_played: args.mode === "multiplayer" ? 1 : 0,
        multiplayer_won: args.mode === "multiplayer" && won ? 1 : 0,
        current_streak: won ? 1 : 0,
        best_streak: won ? 1 : 0,
        total_green_letters: greenLetters,
      };
      await ctx.db.insert("userStats", newStats);
    } else {
      const modePlayedField = `${args.mode}_played` as keyof typeof existingStats;
      const modeWonField = `${args.mode}_won` as keyof typeof existingStats;

      const newCurrentStreak = won ? (existingStats.current_streak || 0) + 1 : 0;
      const newBestStreak = Math.max(newCurrentStreak, existingStats.best_streak || 0);

      const updates: any = {
        [modePlayedField]: (existingStats[modePlayedField] as number || 0) + 1,
        current_streak: newCurrentStreak,
        best_streak: newBestStreak,
        total_green_letters: (existingStats.total_green_letters || 0) + greenLetters,
      };

      if (won) {
        updates[modeWonField] = (existingStats[modeWonField] as number || 0) + 1;
      }

      await ctx.db.patch(existingStats._id, updates);
    }
  },
});
