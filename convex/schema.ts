import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const { users: _authUsers, ...restAuthTables } = authTables;

export default defineSchema({
  ...restAuthTables,

  users: defineTable({
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    googleName: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_username", ["username"]),

  usernameClaims: defineTable({
    username: v.string(),
    userId: v.optional(v.id("users")),
  })
    .index("by_username", ["username"])
    .index("by_user", ["userId"]),

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
    player3Id: v.optional(v.id("users")),
    player4Id: v.optional(v.id("users")),
    lobbyCode: v.optional(v.string()),
    status: v.union(
      v.literal("waiting"),
      v.literal("in_progress"),
      v.literal("finished"),
      v.literal("abandoned")
    ),
    gameType: v.union(v.literal("multiplayer"), v.literal("challenge")),
    mode: v.optional(v.union(v.literal("classic"), v.literal("hard"), v.literal("timed"))),
    winnerId: v.optional(v.id("users")),
    isDraw: v.optional(v.boolean()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    gameEndTime: v.optional(v.number()), // For timed mode
  })
    .index("by_player1", ["player1Id"])
    .index("by_player2", ["player2Id"])
    .index("by_player3", ["player3Id"])
    .index("by_player4", ["player4Id"])
    .index("by_lobby_code", ["lobbyCode"])
    .index("by_status", ["status"]),

  // Target words for games (Server-side validation only)
  gameSecrets: defineTable({
    gameId: v.id("games"),
    targetWord: v.string(), // Kept for backwards compatibility / classic
    targetWords: v.optional(v.array(v.string())), // For timed or long sequences
  }).index("by_game", ["gameId"]),

  // Guesses submitted by players
  guesses: defineTable({
    gameId: v.id("games"),
    playerId: v.id("users"),
    guess: v.string(),
    evaluation: v.array(v.union(v.literal("correct"), v.literal("present"), v.literal("absent"))),
    guessNumber: v.number(),
    wordIndex: v.optional(v.number()), // For timed mode
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

  // Daily Quests
  quests: defineTable({
    userId: v.id("users"),
    dayKey: v.string(), // "YYYY-MM-DD" in UTC
    questSlots: v.array(
      v.object({
        questId: v.string(), // references a quest template key
        title: v.string(),
        description: v.string(),
        target: v.number(),
        progress: v.number(),
        completed: v.boolean(),
        claimed: v.boolean(),
        reward: v.number(), // shards
      })
    ),
  })
    .index("by_user_and_day", ["userId", "dayKey"])
    .index("by_user", ["userId"]),

  // User Cosmetics / Shard Wallet
  userCosmetics: defineTable({
    userId: v.id("users"),
    shards: v.number(),
    ownedCosmetics: v.array(v.string()), // cosmetic template IDs
    equippedCosmetics: v.object({
      theme: v.optional(v.string()),
      letters: v.optional(v.string()),
      grid: v.optional(v.string()),
      background: v.optional(v.string()),
      animation: v.optional(v.string()),
    }),
  }).index("by_user", ["userId"]),
});
