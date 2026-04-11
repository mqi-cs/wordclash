import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { auth } from "./auth";
import { getRandomTargetWord } from "./shared/gameLogic";
import { internal } from "./_generated/api";

const ONLINE_WINDOW_MS = 30_000;
const RANDOM_MATCH_WAIT_MS = 5_000;
const CANDIDATE_SCAN_LIMIT = 50;
const ACTIVE_MATCH_STATUSES = ["searching", "pending_accept"] as const;

type MatchmakingStatus = Doc<"randomMatchmaking">["status"];

const BOT_NAME_PREFIXES = [
  "Nova",
  "Pixel",
  "Shadow",
  "Blaze",
  "Echo",
  "Drift",
  "Comet",
  "Rogue",
  "Cipher",
  "Jade",
];
const BOT_NAME_SUFFIXES = [
  "Fox",
  "Wolf",
  "Pulse",
  "Dash",
  "Viper",
  "Glint",
  "Spark",
  "Stride",
  "Quest",
  "Flare",
];

const isActiveStatus = (status: MatchmakingStatus) =>
  ACTIVE_MATCH_STATUSES.includes(status as (typeof ACTIVE_MATCH_STATUSES)[number]);

const getDisplayName = (user: Doc<"users"> | null) =>
  user?.username ?? user?.name ?? user?.googleName ?? "Unknown User";

const createFakeOpponentName = () => {
  const prefix = BOT_NAME_PREFIXES[Math.floor(Math.random() * BOT_NAME_PREFIXES.length)];
  const suffix = BOT_NAME_SUFFIXES[Math.floor(Math.random() * BOT_NAME_SUFFIXES.length)];
  const digits = Math.floor(10 + Math.random() * 90);
  return `${prefix}${suffix}${digits}`;
};

const shuffle = <T>(values: T[]) => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const getUserGameDocs = async (
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) => {
  const [asPlayer1, asPlayer2, asPlayer3, asPlayer4] = await Promise.all([
    ctx.db.query("games").withIndex("by_player1", (q) => q.eq("player1Id", userId)).take(10),
    ctx.db.query("games").withIndex("by_player2", (q) => q.eq("player2Id", userId)).take(10),
    ctx.db.query("games").withIndex("by_player3", (q) => q.eq("player3Id", userId)).take(10),
    ctx.db.query("games").withIndex("by_player4", (q) => q.eq("player4Id", userId)).take(10),
  ]);

  const byId = new Map<Id<"games">, Doc<"games">>();
  for (const game of [...asPlayer1, ...asPlayer2, ...asPlayer3, ...asPlayer4]) {
    byId.set(game._id, game);
  }
  return [...byId.values()];
};

const isBusyInGame = async (
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) => {
  const games = await getUserGameDocs(ctx, userId);
  return games.some(
    (game) =>
      (game.gameType === "challenge" || game.gameType === "multiplayer") &&
      (game.status === "waiting" || game.status === "in_progress"),
  );
};

const hasActiveMatchmaking = async (
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  now = Date.now(),
) => {
  const requesterRows = await ctx.db
    .query("randomMatchmaking")
    .withIndex("by_requester", (q) => q.eq("requesterId", userId))
    .take(10);

  const hasRequesterRow = requesterRows.some(
    (row) => isActiveStatus(row.status) && row.expiresAt > now,
  );
  if (hasRequesterRow) {
    return true;
  }

  for (const status of ACTIVE_MATCH_STATUSES) {
    const targetedRows = await ctx.db
      .query("randomMatchmaking")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(CANDIDATE_SCAN_LIMIT);

    if (
      targetedRows.some(
        (row) => row.targetUserId === userId && row.expiresAt > now,
      )
    ) {
      return true;
    }
  }

  return false;
};

const deleteChallengeArtifacts = async (
  ctx: MutationCtx,
  gameId: Id<"games">,
) => {
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

const cleanupUnusedChallengeGame = async (
  ctx: MutationCtx,
  gameId: Id<"games"> | undefined,
) => {
  if (!gameId) {
    return;
  }

  const game = await ctx.db.get(gameId);
  if (
    !game ||
    game.gameType !== "challenge" ||
    game.status !== "waiting" ||
    game.player2Id !== undefined
  ) {
    return;
  }

  await deleteChallengeArtifacts(ctx, gameId);
  await ctx.db.delete(gameId);
};

const cleanupExpiredRequesterRows = async (
  ctx: MutationCtx,
  requesterId: Id<"users">,
  now = Date.now(),
) => {
  const rows = await ctx.db
    .query("randomMatchmaking")
    .withIndex("by_requester", (q) => q.eq("requesterId", requesterId))
    .take(10);

  for (const row of rows) {
    if (!isActiveStatus(row.status) || row.expiresAt > now) {
      continue;
    }

    await cleanupUnusedChallengeGame(ctx, row.gameId);
    await ctx.db.patch(row._id, { status: "cancelled" });
  }
};

const createChallengeGame = async (
  ctx: MutationCtx,
  requesterId: Id<"users">,
) => {
  const gameId = await ctx.db.insert("games", {
    player1Id: requesterId,
    status: "waiting",
    gameType: "challenge",
    mode: "classic",
  });

  await ctx.db.insert("gameSecrets", {
    gameId,
    targetWord: getRandomTargetWord(),
  });

  return gameId;
};

const captureGameStarted = async (
  ctx: MutationCtx,
  gameId: Id<"games">,
  requesterId: Id<"users">,
  targetUserId: Id<"users">,
) => {
  await Promise.all(
    [requesterId, targetUserId].map((userId) =>
      ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
        distinctId: userId,
        event: "game_started",
        properties: {
          game_id: gameId,
          game_type: "challenge",
          mode: "classic",
          player_count: 2,
          start_role: userId === requesterId ? "host" : "participant",
          match_source: "random_opponent",
        },
      }),
    ),
  );
};

const pickCandidate = async (
  ctx: MutationCtx,
  requesterId: Id<"users">,
  now = Date.now(),
) => {
  const presenceRows = await ctx.db
    .query("onlinePresence")
    .withIndex("by_available_for_random_match", (q) =>
      q.eq("availableForRandomMatch", true),
    )
    .take(CANDIDATE_SCAN_LIMIT);

  for (const presence of shuffle(presenceRows)) {
    if (presence.userId === requesterId) {
      continue;
    }
    if (now - presence.lastSeenAt > ONLINE_WINDOW_MS) {
      continue;
    }
    if (await isBusyInGame(ctx, presence.userId)) {
      continue;
    }
    if (await hasActiveMatchmaking(ctx, presence.userId, now)) {
      continue;
    }
    return presence.userId;
  }

  return null;
};

export const presenceHeartbeat = mutation({
  args: { availableForRandomMatch: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db
      .query("onlinePresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        availableForRandomMatch: args.availableForRandomMatch,
        lastSeenAt: Date.now(),
      });
    } else {
      await ctx.db.insert("onlinePresence", {
        userId,
        availableForRandomMatch: args.availableForRandomMatch,
        lastSeenAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const startRandomMatchmaking = mutation({
  args: { mode: v.literal("classic") },
  handler: async (ctx, args) => {
    const requesterId = await auth.getUserId(ctx);
    if (!requesterId) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    await cleanupExpiredRequesterRows(ctx, requesterId, now);

    if (await isBusyInGame(ctx, requesterId)) {
      throw new Error("Finish your current multiplayer or challenge match first.");
    }
    if (await hasActiveMatchmaking(ctx, requesterId, now)) {
      throw new Error("You already have a pending random match request.");
    }

    const gameId = await createChallengeGame(ctx, requesterId);
    const targetUserId = await pickCandidate(ctx, requesterId, now);

    const matchmakingId = await ctx.db.insert("randomMatchmaking", {
      requesterId,
      ...(targetUserId ? { targetUserId } : {}),
      gameId,
      mode: args.mode,
      status: targetUserId ? "pending_accept" : "searching",
      expiresAt: now + RANDOM_MATCH_WAIT_MS,
    });

    return {
      matchmakingId,
      status: targetUserId ? "pending_accept" : "searching",
    };
  },
});

export const getMyRandomMatchmakingStatus = query({
  args: { matchmakingId: v.id("randomMatchmaking") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const row = await ctx.db.get(args.matchmakingId);
    if (!row || row.requesterId !== userId) {
      throw new Error("Matchmaking request not found");
    }

    return {
      _id: row._id,
      status: row.status,
      gameId: row.gameId ?? null,
      targetUserId: row.targetUserId ?? null,
      botOpponentName: row.botOpponentName ?? null,
      expiresAt: row.expiresAt,
    };
  },
});

export const getIncomingRandomMatchRequest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return null;
    }

    const row = await ctx.db
      .query("randomMatchmaking")
      .withIndex("by_targetUserId_and_status", (q) =>
        q.eq("targetUserId", userId).eq("status", "pending_accept"),
      )
      .take(1);

    const request = row[0];
    if (!request || request.expiresAt <= Date.now()) {
      return null;
    }

    const requester = await ctx.db.get(request.requesterId);

    return {
      matchmakingId: request._id,
      requesterId: request.requesterId,
      requesterUsername: getDisplayName(requester),
      mode: request.mode,
      expiresAt: request.expiresAt,
    };
  },
});

export const acceptRandomMatchmaking = mutation({
  args: { matchmakingId: v.id("randomMatchmaking") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const row = await ctx.db.get(args.matchmakingId);
    if (!row || row.targetUserId !== userId) {
      throw new Error("Random match request not found");
    }
    if (row.status !== "pending_accept") {
      throw new Error("Random match request is no longer available");
    }
    if (row.expiresAt <= Date.now()) {
      await cleanupUnusedChallengeGame(ctx, row.gameId);
      await ctx.db.patch(row._id, { status: "cancelled" });
      throw new Error("Random match request expired");
    }
    if (!row.gameId) {
      throw new Error("Random match game is unavailable");
    }
    if (await isBusyInGame(ctx, userId)) {
      throw new Error("Finish your current multiplayer or challenge match first.");
    }

    const game = await ctx.db.get(row.gameId);
    if (
      !game ||
      game.gameType !== "challenge" ||
      game.status !== "waiting" ||
      game.player2Id !== undefined
    ) {
      await ctx.db.patch(row._id, { status: "cancelled" });
      throw new Error("Random match is no longer available");
    }

    await ctx.db.patch(game._id, {
      player2Id: userId,
      status: "in_progress",
      startedAt: Date.now(),
    });
    await ctx.db.patch(row._id, { status: "matched" });
    await captureGameStarted(ctx, game._id, row.requesterId, userId);

    return { gameId: game._id };
  },
});

export const declineRandomMatchmaking = mutation({
  args: { matchmakingId: v.id("randomMatchmaking") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const row = await ctx.db.get(args.matchmakingId);
    if (!row || row.targetUserId !== userId) {
      throw new Error("Random match request not found");
    }
    if (row.status !== "pending_accept") {
      throw new Error("Random match request is no longer available");
    }

    await ctx.db.patch(row._id, { status: "declined" });
    return { success: true };
  },
});

export const cancelRandomMatchmaking = mutation({
  args: { matchmakingId: v.id("randomMatchmaking") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const row = await ctx.db.get(args.matchmakingId);
    if (!row || row.requesterId !== userId) {
      throw new Error("Matchmaking request not found");
    }
    if (row.status === "matched") {
      throw new Error("Match already started");
    }

    await cleanupUnusedChallengeGame(ctx, row.gameId);
    await ctx.db.patch(row._id, { status: "cancelled" });
    return { success: true };
  },
});

export const finalizeRandomMatchmakingFallback = mutation({
  args: { matchmakingId: v.id("randomMatchmaking") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const row = await ctx.db.get(args.matchmakingId);
    if (!row || row.requesterId !== userId) {
      throw new Error("Matchmaking request not found");
    }
    if (row.status === "matched") {
      return {
        status: "matched" as const,
        gameId: row.gameId ?? null,
        opponentDisplayName: null,
      };
    }
    if (row.status === "bot_fallback") {
      return {
        status: "bot_fallback" as const,
        gameId: null,
        opponentDisplayName: row.botOpponentName ?? createFakeOpponentName(),
      };
    }
    if (row.status === "cancelled") {
      throw new Error("Matchmaking request was cancelled");
    }
    if (
      row.status !== "declined" &&
      row.expiresAt > Date.now()
    ) {
      throw new Error("Still searching for a random opponent");
    }

    const opponentDisplayName = row.botOpponentName ?? createFakeOpponentName();
    await cleanupUnusedChallengeGame(ctx, row.gameId);
    await ctx.db.patch(row._id, {
      status: "bot_fallback",
      botOpponentName: opponentDisplayName,
    });

    return {
      status: "bot_fallback" as const,
      gameId: null,
      opponentDisplayName,
    };
  },
});
