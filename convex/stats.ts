import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { ANALYTICS_METRICS, incrementMetric } from "./analytics";

type GameDoc = Doc<"games">;
type GameMode = "classic" | "hard" | "timed" | "multiplayer";
type UserStatsDoc = Doc<"userStats">;

const VALID_MODES: GameMode[] = ["classic", "hard", "timed", "multiplayer"];

const getGamePlayerIds = (game: GameDoc): Id<"users">[] =>
  [game.player1Id, game.player2Id, game.player3Id, game.player4Id].filter(
    (playerId): playerId is Id<"users"> => playerId !== undefined,
  );

const getWonCount = (stats: UserStatsDoc, mode: GameMode) => {
  switch (mode) {
    case "classic":
      return stats.classic_won;
    case "hard":
      return stats.hard_won;
    case "timed":
      return stats.timed_won;
    case "multiplayer":
      return stats.multiplayer_won;
  }
};

const getPlayedCount = (stats: UserStatsDoc, mode: GameMode) => {
  switch (mode) {
    case "classic":
      return stats.classic_played;
    case "hard":
      return stats.hard_played;
    case "timed":
      return stats.timed_played;
    case "multiplayer":
      return stats.multiplayer_played;
  }
};

// Fetch leaderboard — bounded scan with take()
export const getLeaderboard = query({
  args: { mode: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!VALID_MODES.includes(args.mode as GameMode)) {
      throw new Error("Invalid game mode");
    }
    const mode = args.mode as GameMode;

    const maxResults = Math.min(args.limit || 10, 50); // Cap at 50

    // Bounded: take at most 200 entries to sort through
    const stats = await ctx.db.query("userStats").take(200);

    const sorted = stats.sort((a, b) => getWonCount(b, mode) - getWonCount(a, mode));
    const limited = sorted.slice(0, maxResults);

    return await Promise.all(limited.map(async (stat) => {
      const user = await ctx.db.get(stat.userId);
      return {
        userId: stat.userId,
        username: user?.username || user?.name || user?.googleName || "Unknown User",
        [`${mode}_won`]: getWonCount(stat, mode),
        [`${mode}_played`]: getPlayedCount(stat, mode),
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
      if (!getGamePlayerIds(game).includes(userId)) {
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
      const newCurrentStreak = won ? (existingStats.current_streak || 0) + 1 : 0;
      const newBestStreak = Math.max(newCurrentStreak, existingStats.best_streak || 0);
      const baseUpdates = {
        current_streak: newCurrentStreak,
        best_streak: newBestStreak,
        total_green_letters: (existingStats.total_green_letters || 0) + greenLetters,
      };

      switch (args.mode) {
        case "classic":
          await ctx.db.patch(existingStats._id, {
            ...baseUpdates,
            classic_played: existingStats.classic_played + 1,
            ...(won ? { classic_won: existingStats.classic_won + 1 } : {}),
          });
          break;
        case "hard":
          await ctx.db.patch(existingStats._id, {
            ...baseUpdates,
            hard_played: existingStats.hard_played + 1,
            ...(won ? { hard_won: existingStats.hard_won + 1 } : {}),
          });
          break;
        case "timed":
          await ctx.db.patch(existingStats._id, {
            ...baseUpdates,
            timed_played: existingStats.timed_played + 1,
            ...(won ? { timed_won: existingStats.timed_won + 1 } : {}),
          });
          break;
        case "multiplayer":
          await ctx.db.patch(existingStats._id, {
            ...baseUpdates,
            multiplayer_played: existingStats.multiplayer_played + 1,
            ...(won ? { multiplayer_won: existingStats.multiplayer_won + 1 } : {}),
          });
          break;
      }
    }

    // Also progress daily quests
    await ctx.runMutation(internal.cosmetics.internalRecordQuestProgress, {
      userId,
      mode: args.mode,
      won,
      greenLetters,
    });

    const completedMetrics = await incrementMetric(
      ctx,
      ANALYTICS_METRICS.gamesCompleted,
      userId,
    );

    const analyticsProperties = {
      metric_day: completedMetrics.dayKey,
      games_completed_total: completedMetrics.totalCount,
      games_completed_today_total: completedMetrics.todayTotalCount,
      games_completed_by_user_total: completedMetrics.userTotalCount,
      games_completed_by_user_today: completedMetrics.userTodayCount,
    };

    const userProperties = {
      total_games_played: completedMetrics.userTotalCount,
      games_played_today: completedMetrics.userTodayCount,
      highest_streak: (existingStats?.best_streak || 0),
      total_green_letters: (existingStats?.total_green_letters || 0) + greenLetters,
    };

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "game_completed",
      properties: {
        mode: args.mode,
        won,
        green_letters: greenLetters,
        game_id: args.gameId,
        ...analyticsProperties,
        $set: userProperties,
      },
    });

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "stats_updated",
      properties: {
        mode: args.mode,
        won,
        green_letters: greenLetters,
        game_id: args.gameId,
        ...analyticsProperties,
        $set: userProperties,
      },
    });
  },
});
