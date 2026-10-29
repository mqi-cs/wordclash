import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

// Shared rules for multiplayer and challenge games: who is still playing,
// whose turn it is, and when a game is decided.

type GameDoc = Doc<"games">;

export const CHALLENGE_TURN_MS = 20_000;
// A guess sent just before the turn ends can arrive slightly after it.
const TURN_GRACE_MS = 2_000;
// Simultaneous classic/hard games forfeit players who stop guessing.
export const IDLE_FORFEIT_MS = 3 * 60 * 1000;

export const getGamePlayerIds = (game: GameDoc): Id<"users">[] =>
  [game.player1Id, game.player2Id, game.player3Id, game.player4Id].filter(
    (playerId): playerId is Id<"users"> => playerId !== undefined,
  );

export const isParticipant = (game: GameDoc, userId: Id<"users">) =>
  getGamePlayerIds(game).includes(userId);

export const isForfeited = (game: GameDoc, userId: Id<"users">) =>
  (game.forfeitedPlayerIds ?? []).includes(userId);

export const getMaxGuesses = (mode: GameDoc["mode"]) =>
  mode === "hard" ? 10 : mode === "timed" ? 999 : 6;

export const isTurnBased = (game: GameDoc) =>
  game.gameType === "challenge" && game.mode !== "timed";

// What the "exit" button does for this player: the host cancels a lobby
// nobody has started yet; anyone else leaves it, and leaving a live game
// forfeits it.
export const getExitAction = (game: GameDoc, userId: Id<"users">) => {
  if (!isParticipant(game, userId)) return null;
  if (game.status === "waiting") return game.player1Id === userId ? ("delete" as const) : ("leave" as const);
  if (game.status === "in_progress" && !isForfeited(game, userId)) return "leave" as const;
  return null;
};

export type PlayerProgress = Awaited<ReturnType<typeof getPlayerProgress>>[number];

export const getPlayerProgress = async (ctx: QueryCtx | MutationCtx, game: GameDoc) => {
  const mode = game.mode ?? "classic";
  return await Promise.all(
    getGamePlayerIds(game).map(async (playerId) => {
      const guesses = await ctx.db
        .query("guesses")
        .withIndex("by_game_and_player", (q) => q.eq("gameId", game._id).eq("playerId", playerId))
        .collect();
      const solvedCount = guesses.filter((guess) => guess.evaluation.every((e) => e === "correct")).length;
      const currentWordIndex = mode === "timed" ? solvedCount : 0;
      const guessCount = guesses.filter((guess) => (guess.wordIndex ?? 0) === currentWordIndex).length;
      const hasWon = mode !== "timed" && solvedCount > 0;

      return {
        id: playerId,
        solvedCount,
        hasWon,
        // Guesses used on the word: the score for a solved classic/hard word.
        guessCount,
        totalGuesses: guesses.length,
        isOut: mode !== "timed" && guessCount >= getMaxGuesses(mode),
        forfeited: isForfeited(game, playerId),
        lastGuessAt: guesses.reduce((latest, guess) => Math.max(latest, guess._creationTime), 0),
      };
    }),
  );
};

// Turn-based challenges: the host goes first, then players alternate.
export const getTurnPlayerId = (game: GameDoc, progress: readonly PlayerProgress[]) => {
  const host = progress.find((player) => player.id === game.player1Id);
  const opponent = progress.find((player) => player.id !== game.player1Id);
  if (!host || !opponent) return null;
  return host.totalGuesses <= opponent.totalGuesses ? host.id : opponent.id;
};

const decideWinner = (
  candidates: readonly PlayerProgress[],
  isBetter: (a: PlayerProgress, b: PlayerProgress) => number,
) => {
  const ranked = [...candidates].sort(isBetter);
  if (ranked.length === 0 || (ranked.length > 1 && isBetter(ranked[0], ranked[1]) === 0)) {
    return { winnerId: undefined, isDraw: true };
  }
  return { winnerId: ranked[0].id, isDraw: false };
};

// Finishes the game if its outcome is decided and reports whether it did.
// `timeUp` is set when a timed game's clock has run out.
export const settleGame = async (
  ctx: MutationCtx,
  game: GameDoc,
  { timeUp = false }: { timeUp?: boolean } = {},
) => {
  if (game.status !== "in_progress") return false;

  const mode = game.mode ?? "classic";
  const progress = await getPlayerProgress(ctx, game);
  const active = progress.filter((player) => !player.forfeited);
  let outcome: { winnerId: Id<"users"> | undefined; isDraw: boolean } | null = null;

  if (progress.length >= 2 && active.length <= 1) {
    // Everyone else left: the last player standing wins.
    outcome = { winnerId: active[0]?.id, isDraw: active.length === 0 };
  } else if (mode === "timed") {
    if (timeUp) {
      outcome = decideWinner(active, (a, b) => b.solvedCount - a.solvedCount);
    }
  } else {
    const winningAttempts = active.filter((player) => player.hasWon).map((player) => player.guessCount);
    const fewestWinningAttempts = winningAttempts.length > 0 ? Math.min(...winningAttempts) : Infinity;
    const isDone = (player: PlayerProgress) =>
      player.forfeited ||
      player.hasWon ||
      player.isOut ||
      // In a turn-based challenge, once someone has solved it the other
      // player only gets to match their number of guesses.
      (isTurnBased(game) && player.guessCount >= fewestWinningAttempts);

    if (progress.every(isDone)) {
      outcome = decideWinner(
        active.filter((player) => player.hasWon),
        (a, b) => a.guessCount - b.guessCount,
      );
    }
  }

  if (!outcome) return false;

  await ctx.db.patch(game._id, {
    status: "finished",
    winnerId: outcome.winnerId,
    isDraw: outcome.isDraw,
    finishedAt: Date.now(),
    turnDeadline: undefined,
  });
  return true;
};

// Starts the clock on the next turn of a turn-based challenge. If it runs out,
// enforceTurnTimeout spends the turn for the player.
export const startNextTurn = async (ctx: MutationCtx, gameId: Id<"games">) => {
  const turnDeadline = Date.now() + CHALLENGE_TURN_MS;
  await ctx.db.patch(gameId, { turnDeadline });
  await ctx.scheduler.runAfter(CHALLENGE_TURN_MS + TURN_GRACE_MS, internal.games.enforceTurnTimeout, {
    gameId,
    turnDeadline,
  });
};

export const scheduleIdleCheck = async (ctx: MutationCtx, gameId: Id<"games">, delayMs: number) => {
  await ctx.scheduler.runAfter(Math.max(delayMs, 1000), internal.games.forfeitIdlePlayers, { gameId });
};
