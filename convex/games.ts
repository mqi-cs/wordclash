import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { getRandomTargetWord } from "./shared/gameLogic";

// Get active games for the current user
export const getMyGames = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const asPlayer1 = await ctx.db
      .query("games")
      .withIndex("by_player1", (q) => q.eq("player1Id", userId))
      .collect();

    const asPlayer2 = await ctx.db
      .query("games")
      .withIndex("by_player2", (q) => q.eq("player2Id", userId))
      .collect();

    return [...asPlayer1, ...asPlayer2].filter(g => g.status === "waiting" || g.status === "in_progress");
  },
});

// Authenticated + authorized game query
export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) return null;

    // Only participants can view the full game
    if (game.player1Id !== userId && game.player2Id !== userId) {
      // For waiting games, return minimal info (needed for join flow)
      if (game.status === "waiting") {
        return {
          _id: game._id,
          _creationTime: game._creationTime,
          status: game.status,
          gameType: game.gameType,
          player1Id: game.player1Id,
          player2Id: game.player2Id,
        };
      }
      throw new Error("You are not part of this game");
    }

    return game;
  },
});

export const getIncomingInvitations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const invites = await ctx.db
      .query("invitations")
      .withIndex("by_toUser", (q) => q.eq("toUserId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .take(20);

    return await Promise.all(invites.map(async (inv) => {
      const sender = await ctx.db.get(inv.fromUserId);
      return {
        ...inv,
        senderUsername: sender?.username || sender?.name || sender?.googleName || "Unknown User"
      };
    }));
  },
});

// Browse open public games — returns minimal fields only
export const getOpenGames = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const waitingGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .take(20);

    return await Promise.all(
      waitingGames
        .filter(g => g.player1Id !== userId)
        .map(async (game) => {
          const host = await ctx.db.get(game.player1Id);
          return {
            _id: game._id,
            _creationTime: game._creationTime,
            gameType: game.gameType,
            hostUsername: host?.username || host?.name || host?.googleName || "Unknown User",
          };
        })
    );
  },
});

export const createGame = mutation({
  args: { gameType: v.union(v.literal("multiplayer"), v.literal("challenge")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Rate limit: max 5 active (waiting) games per user
    const activeGames = await ctx.db
      .query("games")
      .withIndex("by_player1", (q) => q.eq("player1Id", userId))
      .collect();
    const waitingCount = activeGames.filter(g => g.status === "waiting").length;
    if (waitingCount >= 5) {
      throw new Error("You have too many active lobbies. Close some before creating a new one.");
    }

    const gameId = await ctx.db.insert("games", {
      player1Id: userId,
      status: "waiting",
      gameType: args.gameType,
    });

    // Pick the target word SERVER-SIDE
    const word = getRandomTargetWord();
    await ctx.db.insert("gameSecrets", {
      gameId,
      targetWord: word,
    });

    return gameId;
  },
});

export const inviteToGame = mutation({
  args: { gameId: v.id("games"), friendId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Verify the caller owns this game
    const game = await ctx.db.get(args.gameId);
    if (!game || game.player1Id !== userId) {
      throw new Error("You can only invite to your own games");
    }

    await ctx.db.insert("invitations", {
      gameId: args.gameId,
      fromUserId: userId,
      toUserId: args.friendId,
      status: "pending"
    });
  },
});

export const acceptInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.toUserId !== userId) {
      throw new Error("Invitation not found");
    }

    await ctx.db.patch(invitation._id, { status: "accepted" });

    const game = await ctx.db.get(invitation.gameId);
    if (game && !game.player2Id) {
      await ctx.db.patch(game._id, {
        player2Id: userId,
        status: "in_progress",
        startedAt: Date.now()
      });
      return game._id;
    }
    
    throw new Error("Game is no longer available");
  },
});

export const joinGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.player1Id === userId) return args.gameId;
    if (game.player2Id === userId) return args.gameId;

    if (game.player2Id) {
      throw new Error("Game is full");
    }

    await ctx.db.patch(args.gameId, {
      player2Id: userId,
      status: "in_progress",
      startedAt: Date.now()
    });

    return args.gameId;
  },
});

export const getTargetWord = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    if (game.player1Id !== userId && game.player2Id !== userId) {
      throw new Error("You are not part of this game");
    }

    if (game.status !== "finished" && game.status !== "abandoned") {
      throw new Error("Game is not finished yet");
    }

    const secret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .unique();

    return secret ? secret.targetWord : null;
  },
});
