import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  // User Statistics
  userStats: defineTable({
    userId: v.id("users"),
    classic_played: v.number(),
    classic_won: v.number(),
    hard_played: v.number(),
    hard_won: v.number(),
    timed_played: v.number(),
    timed_won: v.number(),
    multiplayer_played: v.number(),
    multiplayer_won: v.number(),
    current_streak: v.number(),
    best_streak: v.number(),
    total_green_letters: v.number(),
  }).index("by_user", ["userId"]),

  // Friendships
  friendships: defineTable({
    user1Id: v.id("users"),
    user2Id: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted")),
    // We'll store who initiated the request
    requesterId: v.id("users"),
  })
    .index("by_user1", ["user1Id"])
    .index("by_user2", ["user2Id"])
    .index("by_users", ["user1Id", "user2Id"]),

  // Multiplayer Lobbies / Games
  games: defineTable({
    player1Id: v.id("users"),
    player2Id: v.optional(v.id("users")), // Optional until someone joins
    status: v.union(
      v.literal("waiting"),
      v.literal("in_progress"),
      v.literal("finished"),
      v.literal("abandoned")
    ),
    gameType: v.union(v.literal("multiplayer"), v.literal("challenge")),
    winnerId: v.optional(v.id("users")),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_player1", ["player1Id"])
    .index("by_player2", ["player2Id"])
    .index("by_status", ["status"]),

  // Target words for games (Server-side validation only)
  gameSecrets: defineTable({
    gameId: v.id("games"),
    targetWord: v.string(),
  }).index("by_game", ["gameId"]),

  // Guesses submitted by players
  guesses: defineTable({
    gameId: v.id("games"),
    playerId: v.id("users"),
    guess: v.string(),
    evaluation: v.array(v.union(v.literal("correct"), v.literal("present"), v.literal("absent"))),
    guessNumber: v.number(),
  }).index("by_game_and_player", ["gameId", "playerId"]),

  // Pending Invites
  invitations: defineTable({
    gameId: v.id("games"),
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
  })
    .index("by_toUser", ["toUserId"])
    .index("by_fromUser", ["fromUserId"])
    .index("by_game", ["gameId"]),
});
