import { MutationCtx, QueryCtx, internalMutation, mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { auth } from "./auth";
import { getRandomTargetWord } from "./shared/gameLogic";
import { internal } from "./_generated/api";
import { ANALYTICS_METRICS, incrementMetric } from "./analytics";
import {
  IDLE_FORFEIT_MS,
  getExitAction,
  getGamePlayerIds,
  getPlayerProgress,
  getTurnPlayerId,
  isParticipant,
  isTurnBased,
  scheduleIdleCheck,
  settleGame,
  startNextTurn,
} from "./gameState";

const MAX_MULTIPLAYER_PLAYERS = 4;
const TIMED_MULTIPLAYER_DURATION_MS = 75 * 1000;
const LOBBY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LOBBY_CODE_LENGTH = 6;
const STALE_WAITING_GAME_MS = 1000 * 60 * 60 * 24;

type GameDoc = Doc<"games">;
type GameMode = "classic" | "hard" | "timed";
const gameModeValidator = v.union(v.literal("classic"), v.literal("hard"), v.literal("timed"));
type UserSummary = {
  id: Id<"users">;
  username: string;
  isHost: boolean;
  equippedCosmetics: {
    theme?: string;
    letters?: string;
    grid?: string;
    background?: string;
    animation?: string;
  };
};

const getPlayerCount = (game: GameDoc) => getGamePlayerIds(game).length;

const getNextOpenSlot = (game: GameDoc) => {
  if (!game.player2Id) return "player2Id" as const;
  if (!game.player3Id) return "player3Id" as const;
  if (!game.player4Id) return "player4Id" as const;
  return null;
};

const getDisplayName = (user: Doc<"users"> | null) =>
  user?.username ?? user?.name ?? user?.googleName ?? "Unknown User";

const isWaitingGameStale = (game: GameDoc, now = Date.now()) =>
  game.status === "waiting" && now - game._creationTime >= STALE_WAITING_GAME_MS;

const buildPlayerSummaries = async (
  ctx: QueryCtx,
  game: GameDoc,
): Promise<UserSummary[]> => {
  const playerIds = getGamePlayerIds(game);
  const [players, cosmetics] = await Promise.all([
    Promise.all(playerIds.map((playerId) => ctx.db.get(playerId))),
    Promise.all(
      playerIds.map((playerId) =>
        ctx.db
          .query("userCosmetics")
          .withIndex("by_user", (q) => q.eq("userId", playerId))
          .unique(),
      ),
    ),
  ]);

  return playerIds.map((playerId, index) => ({
    id: playerId,
    username: getDisplayName(players[index]),
    isHost: playerId === game.player1Id,
    equippedCosmetics: cosmetics[index]?.equippedCosmetics ?? {},
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

  throw new ConvexError("Could not generate a unique lobby code. Please try again.");
};

const normalizeLobbyCode = (code: string) => code.trim().toUpperCase();

const buildGameSecret = (mode: GameMode) => {
  if (mode === "timed") {
    const targetWords = Array.from({ length: 50 }, () => getRandomTargetWord());
    return { targetWord: targetWords[0], targetWords };
  }
  return { targetWord: getRandomTargetWord() };
};

const joinMultiplayerLobby = async (
  ctx: MutationCtx,
  game: GameDoc,
  userId: Id<"users">,
) => {
  if (isParticipant(game, userId)) {
    return game._id;
  }

  if (game.status !== "waiting") {
    throw new ConvexError("This lobby has already started.");
  }

  const nextOpenSlot = getNextOpenSlot(game);
  if (nextOpenSlot === null) {
    throw new ConvexError("This lobby is full.");
  }

  await ctx.db.patch(game._id, {
    [nextOpenSlot]: userId,
  });

  return game._id;
};

const areFriends = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  otherUserId: Id<"users">,
) => {
  const [asUser1, asUser2] = await Promise.all([
    ctx.db
      .query("friendships")
      .withIndex("by_users", (q) => q.eq("user1Id", userId).eq("user2Id", otherUserId))
      .first(),
    ctx.db
      .query("friendships")
      .withIndex("by_users", (q) => q.eq("user1Id", otherUserId).eq("user2Id", userId))
      .first(),
  ]);
  return asUser1?.status === "accepted" || asUser2?.status === "accepted";
};

const deleteGameArtifacts = async (ctx: MutationCtx, gameId: Id<"games">) => {
  const secret = await ctx.db
    .query("gameSecrets")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .unique();

  if (secret) {
    await ctx.db.delete(secret._id);
  }

  for await (const invitation of ctx.db
    .query("invitations")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))) {
    await ctx.db.delete(invitation._id);
  }

  for await (const guess of ctx.db
    .query("guesses")
    .withIndex("by_game_and_player", (q) => q.eq("gameId", gameId))) {
    await ctx.db.delete(guess._id);
  }
};

const deleteGameWithArtifacts = async (ctx: MutationCtx, gameId: Id<"games">) => {
  await deleteGameArtifacts(ctx, gameId);
  await ctx.db.delete(gameId);
};

const captureGameAbandoned = async (
  ctx: MutationCtx,
  game: GameDoc,
  abandonReason: string,
  extraProperties?: Record<string, string | number | boolean | null | undefined>,
) => {
  const playerIds = getGamePlayerIds(game);
  await Promise.all(
    playerIds.map((playerId) =>
      ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
        distinctId: playerId,
        event: "game_abandoned",
        properties: {
          game_id: game._id,
          game_type: game.gameType,
          mode: game.mode ?? "classic",
          status: game.status,
          player_count: getPlayerCount(game),
          abandon_reason: abandonReason,
          ...extraProperties,
        },
      }),
    ),
  );
};

const captureGameStartedForParticipants = async (
  ctx: MutationCtx,
  game: GameDoc,
  gameId: Id<"games">,
  metricProperties?: Record<string, unknown>,
) => {
  const playerIds = getGamePlayerIds(game);
  await Promise.all(
    playerIds.map((playerId) =>
      ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
        distinctId: playerId,
        event: "game_started",
        properties: {
          game_id: gameId,
          game_type: game.gameType,
          mode: game.mode ?? "classic",
          player_count: getPlayerCount(game),
          start_role: playerId === game.player1Id ? "host" : "participant",
          ...(playerId === game.player1Id ? metricProperties ?? {} : {}),
        },
      }),
    ),
  );
};

// Throwing rolls back the whole mutation, so expired lobbies are deleted by
// cleanupStaleWaitingGamesImpl rather than here.
const ensureGameIsNotStale = (game: GameDoc) => {
  if (isWaitingGameStale(game)) {
    throw new ConvexError("This waiting game expired.");
  }
};

const cleanupStaleWaitingGamesImpl = async (ctx: MutationCtx) => {
  const now = Date.now();
  const waitingGames = await ctx.db
    .query("games")
    .withIndex("by_status", (q) => q.eq("status", "waiting"))
    .take(100);

  let deletedCount = 0;
  for (const game of waitingGames) {
    if (!isWaitingGameStale(game, now)) {
      continue;
    }
    await captureGameAbandoned(ctx, game, "waiting_game_expired");
    await deleteGameWithArtifacts(ctx, game._id);
    deletedCount += 1;
  }

  return { deletedCount };
};

const joinGameById = async (
  ctx: MutationCtx,
  gameId: Id<"games">,
  userId: Id<"users">,
) => {
  const game = await ctx.db.get(gameId);
  if (!game) throw new ConvexError("Game not found");
  ensureGameIsNotStale(game);

  if (game.gameType === "multiplayer") {
    return await joinMultiplayerLobby(ctx, game, userId);
  }

  if (game.player1Id === userId || game.player2Id === userId) {
    return game._id;
  }

  if (game.player2Id) {
    throw new ConvexError("Game is full");
  }

  // Challenges are friend-to-friend: only the invited player may take the
  // open seat, not anyone who obtains the game id.
  if (!(await hasInvitationToGame(ctx, game._id, userId))) {
    throw new ConvexError("You have not been invited to this challenge");
  }

  // Timed challenges start as soon as the opponent joins, so the clock has
  // to start here too, or the game never ends.
  const gameEndTime =
    game.mode === "timed" ? await scheduleTimedGameEnd(ctx, game._id) : undefined;

  await ctx.db.patch(game._id, {
    player2Id: userId,
    status: "in_progress",
    startedAt: Date.now(),
    ...(gameEndTime !== undefined ? { gameEndTime } : {}),
  });

  if (isTurnBased(game)) {
    await startNextTurn(ctx, game._id);
  }

  await captureGameStartedForParticipants(
    ctx,
    {
      ...game,
      player2Id: userId,
      status: "in_progress",
      startedAt: Date.now(),
    },
    game._id,
  );

  return game._id;
};

const scheduleTimedGameEnd = async (ctx: MutationCtx, gameId: Id<"games">) => {
  await ctx.scheduler.runAfter(TIMED_MULTIPLAYER_DURATION_MS, internal.games.finishTimedGame, {
    gameId,
  });
  return Date.now() + TIMED_MULTIPLAYER_DURATION_MS;
};

const hasInvitationToGame = async (
  ctx: MutationCtx,
  gameId: Id<"games">,
  userId: Id<"users">,
) => {
  const invitations = await ctx.db
    .query("invitations")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(20);
  return invitations.some(
    (invitation) => invitation.toUserId === userId && invitation.status !== "declined",
  );
};


// Get active games for the current user
export const getMyGames = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    const now = Date.now();

    const [asPlayer1, asPlayer2, asPlayer3, asPlayer4] = await Promise.all([
      // Newest first: ascending order would only ever return a player's
      // oldest 20 games, hiding every game they've created since.
      ctx.db.query("games").withIndex("by_player1", (q) => q.eq("player1Id", userId)).order("desc").take(20),
      ctx.db.query("games").withIndex("by_player2", (q) => q.eq("player2Id", userId)).order("desc").take(20),
      ctx.db.query("games").withIndex("by_player3", (q) => q.eq("player3Id", userId)).order("desc").take(20),
      ctx.db.query("games").withIndex("by_player4", (q) => q.eq("player4Id", userId)).order("desc").take(20),
    ]);

    const uniqueGames = new Map<Id<"games">, GameDoc>();
    for (const game of [...asPlayer1, ...asPlayer2, ...asPlayer3, ...asPlayer4]) {
      if (
        (game.status === "waiting" && !isWaitingGameStale(game, now)) ||
        game.status === "in_progress"
      ) {
        uniqueGames.set(game._id, game);
      }
    }

    return [...uniqueGames.values()]
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((game) => ({
        ...game,
        playerCount: getPlayerCount(game),
        lobbyCode: game.lobbyCode ?? null,
        exitAction: getExitAction(game, userId),
      }));
  },
});

// Authenticated + authorized game query
export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) return null;
    if (isWaitingGameStale(game)) return null;

    const canPreviewWaitingLobby =
      game.gameType === "multiplayer" && game.status === "waiting";

    if (!isParticipant(game, userId) && !canPreviewWaitingLobby) {
      throw new ConvexError("You are not part of this game");
    }

    return {
      ...game,
      playerCount: getPlayerCount(game),
      players: await buildPlayerSummaries(ctx, game),
      lobbyCode: game.lobbyCode ?? null,
      exitAction: getExitAction(game, userId),
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

    const inviteDetails = await Promise.all(
      pendingInvites.map(async (invitation) => {
        const game = await ctx.db.get(invitation.gameId);
        if (!game || isWaitingGameStale(game)) {
          return null;
        }
        const sender = await ctx.db.get(invitation.fromUserId);
        return {
          ...invitation,
          senderUsername: getDisplayName(sender),
        };
      }),
    );

    return inviteDetails.filter((invitation) => invitation !== null);
  },
});

// Browse open public games — returns minimal fields only
export const getOpenGames = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    const now = Date.now();

    const waitingGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .take(20);

    return await Promise.all(
      waitingGames
        .filter(
          (game) =>
            game.gameType === "multiplayer" &&
            !isWaitingGameStale(game, now) &&
            !isParticipant(game, userId),
        )
        .map(async (game) => {
          const host = await ctx.db.get(game.player1Id);
          return {
            _id: game._id,
            _creationTime: game._creationTime,
            gameType: game.gameType,
            mode: game.mode,
            hostUsername: getDisplayName(host),
            playerCount: getPlayerCount(game),
            lobbyCode: game.lobbyCode ?? null,
          };
        }),
    );
  },
});

export const createGame = mutation({
  args: { 
    gameType: v.union(v.literal("multiplayer"), v.literal("challenge")),
    mode: v.optional(gameModeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");
    await cleanupStaleWaitingGamesImpl(ctx);

    const hostedGames = await ctx.db
      .query("games")
      .withIndex("by_player1", (q) => q.eq("player1Id", userId))
      .order("desc")
      .take(20);
    const waitingCount = hostedGames.filter((game) => game.status === "waiting").length;
    if (waitingCount >= 5) {
      throw new ConvexError("You have too many active lobbies. Close some before creating a new one.");
    }

    const lobbyCode =
      args.gameType === "multiplayer" ? await generateLobbyCode(ctx) : undefined;

    const gameMode = args.mode ?? "classic";

    const gameId = await ctx.db.insert("games", {
      player1Id: userId,
      status: "waiting",
      gameType: args.gameType,
      mode: gameMode,
      ...(lobbyCode ? { lobbyCode } : {}),
    });

    await ctx.db.insert("gameSecrets", { gameId, ...buildGameSecret(gameMode) });

    const createdMetrics = await incrementMetric(
      ctx,
      ANALYTICS_METRICS.gamesCreated,
      userId,
    );

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "game_created",
      properties: {
        game_type: args.gameType,
        mode: gameMode,
        game_id: gameId,
        has_lobby_code: !!lobbyCode,
        metric_day: createdMetrics.dayKey,
        games_created_by_user_total: createdMetrics.userTotalCount,
        games_created_by_user_today: createdMetrics.userTodayCount,
      },
    });

    return gameId;
  },
});

export const startGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new ConvexError("Game not found");
    ensureGameIsNotStale(game);
    if (game.gameType !== "multiplayer") throw new ConvexError("Only multiplayer lobbies can be started.");
    if (game.player1Id !== userId) throw new ConvexError("Only the host can start this game.");
    if (game.status !== "waiting") throw new ConvexError("This game has already started.");
    if (getPlayerCount(game) < 2) throw new ConvexError("You need at least 2 players to start.");

    const updates: Partial<Doc<"games">> = {
      status: "in_progress",
      startedAt: Date.now(),
    };

    if (game.mode === "timed") {
      updates.gameEndTime = await scheduleTimedGameEnd(ctx, args.gameId);
    } else {
      await scheduleIdleCheck(ctx, args.gameId, IDLE_FORFEIT_MS);
    }

    await ctx.db.patch(game._id, updates);

    const startedMetrics = await incrementMetric(
      ctx,
      ANALYTICS_METRICS.gamesStarted,
      userId,
    );

    await captureGameStartedForParticipants(ctx, game, args.gameId, {
      metric_day: startedMetrics.dayKey,
      games_started_by_user_total: startedMetrics.userTotalCount,
      games_started_by_user_today: startedMetrics.userTodayCount,
    });

    return game._id;
  },
});

export const setLobbyMode = mutation({
  args: { gameId: v.id("games"), mode: gameModeValidator },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new ConvexError("Game not found");
    ensureGameIsNotStale(game);
    if (game.gameType !== "multiplayer") throw new ConvexError("Only multiplayer lobbies have a selectable mode.");
    if (game.player1Id !== userId) throw new ConvexError("Only the host can change the mode.");
    if (game.status !== "waiting") throw new ConvexError("This game has already started.");

    if ((game.mode ?? "classic") === args.mode) {
      return game._id;
    }

    // Timed games need a queue of words, so the secret is regenerated to
    // match the new mode.
    const secret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .unique();
    const nextSecret = buildGameSecret(args.mode);
    if (secret) {
      await ctx.db.replace(secret._id, { gameId: game._id, ...nextSecret });
    } else {
      await ctx.db.insert("gameSecrets", { gameId: game._id, ...nextSecret });
    }

    await ctx.db.patch(game._id, { mode: args.mode });
    return game._id;
  },
});

export const inviteToGame = mutation({
  args: { gameId: v.id("games"), friendId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (game) {
      ensureGameIsNotStale(game);
    }
    if (!game || game.player1Id !== userId) {
      throw new ConvexError("You can only invite to your own games");
    }
    if (game.status !== "waiting") {
      throw new ConvexError("This game has already started");
    }
    if (args.friendId === userId) {
      throw new ConvexError("You can't invite yourself");
    }
    if (!(await areFriends(ctx, userId, args.friendId))) {
      throw new ConvexError("You can only invite friends");
    }
    if (await hasInvitationToGame(ctx, args.gameId, args.friendId)) {
      return;
    }

    await ctx.db.insert("invitations", {
      gameId: args.gameId,
      fromUserId: userId,
      toUserId: args.friendId,
      status: "pending",
    });

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "invitation_sent",
      properties: {
        game_id: args.gameId,
        game_type: game.gameType,
      },
    });
  },
});

export const acceptInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.toUserId !== userId) {
      throw new ConvexError("Invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new ConvexError("Invitation is no longer available");
    }

    const game = await ctx.db.get(invitation.gameId);
    if (!game) {
      throw new ConvexError("Challenge is no longer available");
    }
    ensureGameIsNotStale(game);

    await ctx.db.patch(invitation._id, { status: "accepted" });
    const gameId = await joinGameById(ctx, invitation.gameId, userId);

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "game_joined",
      properties: {
        game_id: gameId,
        game_type: game.gameType,
        join_method: "invitation",
      },
    });

    return gameId;
  },
});

export const declineInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.toUserId !== userId) {
      throw new ConvexError("Invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new ConvexError("Invitation is no longer available");
    }

    const game = await ctx.db.get(invitation.gameId);
    if (
      game &&
      game.gameType === "challenge" &&
      game.status === "waiting" &&
      game.player2Id === undefined
    ) {
      await deleteGameWithArtifacts(ctx, game._id);
      await captureGameAbandoned(ctx, game, "invitation_declined");
      await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
        distinctId: userId,
        event: "invitation declined",
        properties: {
          game_id: invitation.gameId,
          game_type: game.gameType,
        },
      });
      return { success: true };
    }

    await ctx.db.patch(invitation._id, { status: "declined" });

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "invitation_declined",
      properties: {
        game_id: invitation.gameId,
        game_type: game?.gameType ?? "unknown",
      },
    });

    return { success: true };
  },
});

export const joinGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const gameId = await joinGameById(ctx, args.gameId, userId);
    const game = await ctx.db.get(args.gameId);

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "game_joined",
      properties: {
        game_id: gameId,
        game_type: game?.gameType ?? "unknown",
        join_method: "direct",
      },
    });

    return gameId;
  },
});

export const joinGameByCode = mutation({
  args: { lobbyCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");
    await cleanupStaleWaitingGamesImpl(ctx);

    const normalizedCode = normalizeLobbyCode(args.lobbyCode);
    if (normalizedCode.length !== LOBBY_CODE_LENGTH) {
      throw new ConvexError("Please enter a valid 6-character lobby code.");
    }

    const game = await ctx.db
      .query("games")
      .withIndex("by_lobby_code", (q) => q.eq("lobbyCode", normalizedCode))
      .unique();

    if (!game || game.gameType !== "multiplayer") {
      throw new ConvexError("Lobby not found.");
    }
    ensureGameIsNotStale(game);

    const gameId = await joinMultiplayerLobby(ctx, game, userId);

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "game_joined",
      properties: {
        game_id: gameId,
        game_type: "multiplayer",
        join_method: "lobby_code",
      },
    });

    return gameId;
  },
});

export const cleanupStaleWaitingGames = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");
    return await cleanupStaleWaitingGamesImpl(ctx);
  },
});

export const deleteGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new ConvexError("Game not found");
    if (isWaitingGameStale(game)) {
      throw new ConvexError("Game expired");
    }
    // Deleting removes the game for everyone, so it is limited to the host of
    // a game that hasn't started. Everyone else leaves (see leaveGame).
    if (getExitAction(game, userId) !== "delete") {
      throw new ConvexError("Only the host can delete a game that hasn't started.");
    }

    const deletingPlayerRole = "host";
    await captureGameAbandoned(
      ctx,
      game,
      `${game.status}_game_deleted_by_player`,
      {
        deleted_by_user_id: userId,
        deleted_by_role: deletingPlayerRole,
      },
    );
    await deleteGameWithArtifacts(ctx, game._id);

    return { success: true };
  },
});

export const finishTimedGame = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "in_progress" || game.mode !== "timed") return;

    if (game.gameEndTime && game.gameEndTime > Date.now()) {
      await ctx.scheduler.runAfter(game.gameEndTime - Date.now(), internal.games.finishTimedGame, {
        gameId: args.gameId,
      });
      return;
    }

    await settleGame(ctx, game, { timeUp: true });
  },
});

export const leaveGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new ConvexError("Game not found");
    if (getExitAction(game, userId) !== "leave") {
      throw new ConvexError("You can't leave this game.");
    }

    if (game.status === "waiting") {
      const seat = (["player2Id", "player3Id", "player4Id"] as const).find(
        (slot) => game[slot] === userId,
      );
      if (seat) {
        await ctx.db.patch(game._id, { [seat]: undefined });
      }
      return { forfeited: false };
    }

    // Leaving a live game forfeits it; the others play on.
    const forfeitedGame = {
      ...game,
      forfeitedPlayerIds: [...(game.forfeitedPlayerIds ?? []), userId],
    };
    await ctx.db.patch(game._id, { forfeitedPlayerIds: forfeitedGame.forfeitedPlayerIds });
    await settleGame(ctx, forfeitedGame);

    await captureGameAbandoned(ctx, game, "player_forfeited", { forfeited_by_user_id: userId });
    return { forfeited: true };
  },
});

// Spends the turn of a challenge player who let their clock run out, so an
// absent opponent can't stall the game.
export const enforceTurnTimeout = internalMutation({
  args: { gameId: v.id("games"), turnDeadline: v.number() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "in_progress" || game.turnDeadline !== args.turnDeadline) {
      return; // A guess was made in time (or the game ended).
    }

    const progress = await getPlayerProgress(ctx, game);
    const turnPlayerId = getTurnPlayerId(game, progress);
    const turnPlayer = progress.find((player) => player.id === turnPlayerId);
    if (!turnPlayer) return;

    // A skipped turn is a blank row: it uses up a guess and reveals nothing.
    await ctx.db.insert("guesses", {
      gameId: game._id,
      playerId: turnPlayer.id,
      guess: "",
      evaluation: ["absent", "absent", "absent", "absent", "absent"],
      guessNumber: turnPlayer.guessCount + 1,
      wordIndex: 0,
    });

    if (!(await settleGame(ctx, game))) {
      await startNextTurn(ctx, game._id);
    }
  },
});

// Forfeits players in a simultaneous classic/hard game who have stopped
// guessing, so one absent player can't keep everyone else waiting.
export const forfeitIdlePlayers = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "in_progress" || game.mode === "timed" || isTurnBased(game)) {
      return;
    }

    const now = Date.now();
    const startedAt = game.startedAt ?? game._creationTime;
    const stillPlaying = (await getPlayerProgress(ctx, game)).filter(
      (player) => !player.forfeited && !player.hasWon && !player.isOut,
    );
    const lastActive = (player: (typeof stillPlaying)[number]) => Math.max(startedAt, player.lastGuessAt);
    const idleIds = stillPlaying
      .filter((player) => now - lastActive(player) >= IDLE_FORFEIT_MS)
      .map((player) => player.id);

    const updatedGame = idleIds.length
      ? { ...game, forfeitedPlayerIds: [...(game.forfeitedPlayerIds ?? []), ...idleIds] }
      : game;
    if (idleIds.length) {
      await ctx.db.patch(game._id, { forfeitedPlayerIds: updatedGame.forfeitedPlayerIds });
    }

    if (await settleGame(ctx, updatedGame)) return;

    const remaining = stillPlaying.filter((player) => !idleIds.includes(player.id));
    if (remaining.length > 0) {
      const nextIdleAt = Math.min(...remaining.map((player) => lastActive(player) + IDLE_FORFEIT_MS));
      await scheduleIdleCheck(ctx, game._id, nextIdleAt - now);
    }
  },
});

export const getTargetWord = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new ConvexError("Game not found");
    if (!isParticipant(game, userId)) {
      throw new ConvexError("You are not part of this game");
    }

    if (game.status !== "finished" && game.status !== "abandoned") {
      throw new ConvexError("Game is not finished yet");
    }

    const secret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .unique();

    return secret ? secret.targetWord : null;
  },
});
