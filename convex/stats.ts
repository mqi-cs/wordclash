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
    gameType: v.optional(
      v.union(v.literal("solo"), v.literal("bot"), v.literal("multiplayer")),
    ),
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

    let nextStats: Omit<UserStatsDoc, "_id" | "_creationTime">;

    if (!existingStats) {
      nextStats = {
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
      await ctx.db.insert("userStats", nextStats);
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
          nextStats = {
            ...existingStats,
            ...baseUpdates,
            classic_played: existingStats.classic_played + 1,
            classic_won: existingStats.classic_won + (won ? 1 : 0),
          };
          break;
        case "hard":
          nextStats = {
            ...existingStats,
            ...baseUpdates,
            hard_played: existingStats.hard_played + 1,
            hard_won: existingStats.hard_won + (won ? 1 : 0),
          };
          break;
        case "timed":
          nextStats = {
            ...existingStats,
            ...baseUpdates,
            timed_played: existingStats.timed_played + 1,
            timed_won: existingStats.timed_won + (won ? 1 : 0),
          };
          break;
        case "multiplayer":
          nextStats = {
            ...existingStats,
            ...baseUpdates,
            multiplayer_played: existingStats.multiplayer_played + 1,
            multiplayer_won: existingStats.multiplayer_won + (won ? 1 : 0),
          };
          break;
      }

      await ctx.db.patch(existingStats._id, {
        classic_played: nextStats.classic_played,
        classic_won: nextStats.classic_won,
        hard_played: nextStats.hard_played,
        hard_won: nextStats.hard_won,
        timed_played: nextStats.timed_played,
        timed_won: nextStats.timed_won,
        multiplayer_played: nextStats.multiplayer_played,
        multiplayer_won: nextStats.multiplayer_won,
        current_streak: nextStats.current_streak,
        best_streak: nextStats.best_streak,
        total_green_letters: nextStats.total_green_letters,
      });
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

    const totalGamesPlayed =
      nextStats.classic_played +
      nextStats.hard_played +
      nextStats.timed_played +
      nextStats.multiplayer_played;

    const userProperties = {
      total_games_played: totalGamesPlayed,
      total_games_completed: totalGamesPlayed,
      games_played_today: completedMetrics.userTodayCount,
      games_completed_today: completedMetrics.userTodayCount,
      classic_games_played: nextStats.classic_played,
      hard_games_played: nextStats.hard_played,
      timed_games_played: nextStats.timed_played,
      multiplayer_games_played: nextStats.multiplayer_played,
      current_streak: nextStats.current_streak,
      highest_streak: nextStats.best_streak,
      total_green_letters: nextStats.total_green_letters,
      last_game_mode: args.mode,
      last_game_type:
        args.gameType ?? (args.mode === "multiplayer" ? "multiplayer" : "solo"),
      last_game_completed_at: Date.now(),
      has_signed_up: true,
    };

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "game_completed",
      properties: {
        mode: args.mode,
        game_type:
          args.gameType ?? (args.mode === "multiplayer" ? "multiplayer" : "solo"),
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
        game_type:
          args.gameType ?? (args.mode === "multiplayer" ? "multiplayer" : "solo"),
        won,
        green_letters: greenLetters,
        game_id: args.gameId,
        ...analyticsProperties,
        $set: userProperties,
      },
    });
  },
});
