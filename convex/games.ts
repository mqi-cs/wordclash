import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { auth } from "./auth";
import { getRandomTargetWord } from "./shared/gameLogic";

const MAX_MULTIPLAYER_PLAYERS = 4;
const LOBBY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LOBBY_CODE_LENGTH = 6;

type GameDoc = Doc<"games">;
type UserSummary = {
  id: Id<"users">;
  username: string;
  isHost: boolean;
};

const getGamePlayerIds = (game: GameDoc): Id<"users">[] =>
  [game.player1Id, game.player2Id, game.player3Id, game.player4Id].filter(
    (playerId): playerId is Id<"users"> => playerId !== undefined,
  );

const isParticipant = (game: GameDoc, userId: Id<"users">) =>
  getGamePlayerIds(game).includes(userId);

const getPlayerCount = (game: GameDoc) => getGamePlayerIds(game).length;

const getNextOpenSlot = (game: GameDoc) => {
  if (!game.player2Id) return "player2Id" as const;
  if (!game.player3Id) return "player3Id" as const;
  if (!game.player4Id) return "player4Id" as const;
  return null;
};

const getDisplayName = (user: Doc<"users"> | null) =>
  user?.username ?? user?.name ?? user?.googleName ?? "Unknown User";

const buildPlayerSummaries = async (
  ctx: QueryCtx,
  game: GameDoc,
): Promise<UserSummary[]> => {
  const playerIds = getGamePlayerIds(game);
  const players = await Promise.all(playerIds.map((playerId) => ctx.db.get(playerId)));

  return playerIds.map((playerId, index) => ({
    id: playerId,
    username: getDisplayName(players[index]),
    isHost: playerId === game.player1Id,
  }));
};

const generateLobbyCode = async (ctx: MutationCtx) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = "";
    for (let i = 0; i < LOBBY_CODE_LENGTH; i += 1) {
      const randomIndex = Math.floor(Math.random() * LOBBY_CODE_ALPHABET.length);
      code += LOBBY_CODE_ALPHABET[randomIndex];
    }

    const existing = await ctx.db
      .query("games")
      .withIndex("by_lobby_code", (q) => q.eq("lobbyCode", code))
      .unique();

    if (existing === null) {
      return code;
    }
  }

  throw new Error("Could not generate a unique lobby code. Please try again.");
};

const normalizeLobbyCode = (code: string) => code.trim().toUpperCase();

const joinMultiplayerLobby = async (
  ctx: MutationCtx,
  game: GameDoc,
  userId: Id<"users">,
) => {
  if (isParticipant(game, userId)) {
    return game._id;
  }

  if (game.status !== "waiting") {
    throw new Error("This lobby has already started.");
  }

  const nextOpenSlot = getNextOpenSlot(game);
  if (nextOpenSlot === null) {
    throw new Error("This lobby is full.");
  }

  await ctx.db.patch(game._id, {
    [nextOpenSlot]: userId,
  });

  return game._id;
};

const joinGameById = async (
  ctx: MutationCtx,
  gameId: Id<"games">,
  userId: Id<"users">,
) => {
  const game = await ctx.db.get(gameId);
  if (!game) throw new Error("Game not found");

  if (game.gameType === "multiplayer") {
    return await joinMultiplayerLobby(ctx, game, userId);
  }

  if (game.player1Id === userId || game.player2Id === userId) {
    return game._id;
  }

  if (game.player2Id) {
    throw new Error("Game is full");
  }

  await ctx.db.patch(game._id, {
    player2Id: userId,
    status: "in_progress",
    startedAt: Date.now(),
  });

  return game._id;
};

// Get active games for the current user
export const getMyGames = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const [asPlayer1, asPlayer2, asPlayer3, asPlayer4] = await Promise.all([
      ctx.db.query("games").withIndex("by_player1", (q) => q.eq("player1Id", userId)).take(20),
      ctx.db.query("games").withIndex("by_player2", (q) => q.eq("player2Id", userId)).take(20),
      ctx.db.query("games").withIndex("by_player3", (q) => q.eq("player3Id", userId)).take(20),
      ctx.db.query("games").withIndex("by_player4", (q) => q.eq("player4Id", userId)).take(20),
    ]);

    const uniqueGames = new Map<Id<"games">, GameDoc>();
    for (const game of [...asPlayer1, ...asPlayer2, ...asPlayer3, ...asPlayer4]) {
      if (game.status === "waiting" || game.status === "in_progress") {
        uniqueGames.set(game._id, game);
      }
    }

    return [...uniqueGames.values()]
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((game) => ({
        ...game,
        playerCount: getPlayerCount(game),
        lobbyCode: game.lobbyCode ?? null,
      }));
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

    const canPreviewWaitingLobby =
      game.gameType === "multiplayer" && game.status === "waiting";

    if (!isParticipant(game, userId) && !canPreviewWaitingLobby) {
      throw new Error("You are not part of this game");
    }

    return {
      ...game,
      playerCount: getPlayerCount(game),
      players: await buildPlayerSummaries(ctx, game),
      lobbyCode: game.lobbyCode ?? null,
    };
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
      .take(20);

    const pendingInvites = invites.filter((invite) => invite.status === "pending");

    return await Promise.all(
      pendingInvites.map(async (invitation) => {
        const sender = await ctx.db.get(invitation.fromUserId);
        return {
          ...invitation,
          senderUsername: getDisplayName(sender),
        };
      }),
    );
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
        .filter((game) => game.gameType === "multiplayer" && !isParticipant(game, userId))
        .map(async (game) => {
          const host = await ctx.db.get(game.player1Id);
          return {
            _id: game._id,
            _creationTime: game._creationTime,
            gameType: game.gameType,
            hostUsername: getDisplayName(host),
            playerCount: getPlayerCount(game),
            lobbyCode: game.lobbyCode ?? null,
          };
        }),
    );
  },
});

export const createGame = mutation({
  args: { gameType: v.union(v.literal("multiplayer"), v.literal("challenge")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const hostedGames = await ctx.db
      .query("games")
      .withIndex("by_player1", (q) => q.eq("player1Id", userId))
      .take(10);
    const waitingCount = hostedGames.filter((game) => game.status === "waiting").length;
    if (waitingCount >= 5) {
      throw new Error("You have too many active lobbies. Close some before creating a new one.");
    }

    const lobbyCode =
      args.gameType === "multiplayer" ? await generateLobbyCode(ctx) : undefined;

    const gameId = await ctx.db.insert("games", {
      player1Id: userId,
      status: "waiting",
      gameType: args.gameType,
      ...(lobbyCode ? { lobbyCode } : {}),
    });

    const word = getRandomTargetWord();
    await ctx.db.insert("gameSecrets", {
      gameId,
      targetWord: word,
    });

    return gameId;
  },
});

export const startGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.gameType !== "multiplayer") throw new Error("Only multiplayer lobbies can be started.");
    if (game.player1Id !== userId) throw new Error("Only the host can start this game.");
    if (game.status !== "waiting") throw new Error("This game has already started.");
    if (getPlayerCount(game) < 2) throw new Error("You need at least 2 players to start.");

    await ctx.db.patch(game._id, {
      status: "in_progress",
      startedAt: Date.now(),
    });

    return game._id;
  },
});

export const inviteToGame = mutation({
  args: { gameId: v.id("games"), friendId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game || game.player1Id !== userId) {
      throw new Error("You can only invite to your own games");
    }

    await ctx.db.insert("invitations", {
      gameId: args.gameId,
      fromUserId: userId,
      toUserId: args.friendId,
      status: "pending",
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
    return await joinGameById(ctx, invitation.gameId, userId);
  },
});

export const joinGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await joinGameById(ctx, args.gameId, userId);
  },
});

export const joinGameByCode = mutation({
  args: { lobbyCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const normalizedCode = normalizeLobbyCode(args.lobbyCode);
    if (normalizedCode.length !== LOBBY_CODE_LENGTH) {
      throw new Error("Please enter a valid 6-character lobby code.");
    }

    const game = await ctx.db
      .query("games")
      .withIndex("by_lobby_code", (q) => q.eq("lobbyCode", normalizedCode))
      .unique();

    if (!game || game.gameType !== "multiplayer") {
      throw new Error("Lobby not found.");
    }

    return await joinMultiplayerLobby(ctx, game, userId);
  },
});

export const getTargetWord = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (!isParticipant(game, userId)) {
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
