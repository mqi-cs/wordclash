import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

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

export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
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
      .collect();

    return await Promise.all(invites.map(async (inv) => {
      const sender = await ctx.db.get(inv.fromUserId);
      return {
        ...inv,
        senderUsername: sender?.name || "Unknown User"
      };
    }));
  },
});

export const createGame = mutation({
  args: { gameType: v.union(v.literal("multiplayer"), v.literal("challenge")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const gameId = await ctx.db.insert("games", {
      player1Id: userId,
      status: "waiting",
      gameType: args.gameType,
    });

    return gameId;
  },
});

export const inviteToGame = mutation({
  args: { gameId: v.id("games"), friendId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

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

    // Join the game
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
    if (game.player1Id === userId) return args.gameId; // Resuming own game
    if (game.player2Id === userId) return args.gameId; // Resuming own game

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

export const setTargetWord = mutation({
  args: { gameId: v.id("games"), word: v.string() },
  handler: async (ctx, args) => {
    // Usually only allowed once per game, ideally backend should pick it randomly using an action,
    // but the original app had the client pass it, or we can just ensure it's set securely.
    const existingSecret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .unique();

    if (!existingSecret) {
      await ctx.db.insert("gameSecrets", {
        gameId: args.gameId,
        targetWord: args.word.toUpperCase()
      });
    }
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
