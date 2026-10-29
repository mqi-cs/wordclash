import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { auth } from "./auth";
import { evaluateGuess, isValidGuessFormat } from "./shared/gameLogic";
import { isValidWord } from "./shared/words";
import { internal } from "./_generated/api";
import {
  getMaxGuesses,
  getPlayerProgress,
  getTurnPlayerId,
  isForfeited,
  isParticipant,
  isTurnBased,
  settleGame,
  startNextTurn,
} from "./gameState";

const TIMED_BONUS_MS = 25 * 1000;

// Authenticated query — only game participants can see guesses
export const getGuesses = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    // Verify the caller is in this game
    const game = await ctx.db.get(args.gameId);
    if (!game) return [];
    if (!isParticipant(game, userId)) {
      throw new ConvexError("You are not part of this game");
    }

    const guesses = await ctx.db
      .query("guesses")
      .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId))
      .collect();

    // Opponents' words stay hidden until the game is over: a solved guess is
    // the target word itself. Their colour patterns are still shown.
    const revealOpponentWords = game.status === "finished" || game.status === "abandoned";

    return guesses
      .sort((a, b) => a.guessNumber - b.guessNumber)
      .map((guess) =>
        revealOpponentWords || guess.playerId === userId ? guess : { ...guess, guess: "" },
      );
  },
});

export const submitGuess = mutation({
  args: { gameId: v.id("games"), guess: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new ConvexError("Game not found");
    if (!isParticipant(game, userId)) throw new ConvexError("You are not part of this game");
    if (game.status !== "in_progress") throw new ConvexError("Game is not active");
    if (isForfeited(game, userId)) throw new ConvexError("You left this match");

    const now = Date.now();
    const mode = game.mode ?? "classic";

    // For timed mode, block if time is up
    if (mode === "timed" && game.gameEndTime && now > game.gameEndTime) {
      throw new ConvexError("Time is up!");
    }

    const normalizedGuess = args.guess.toUpperCase();
    if (!isValidGuessFormat(normalizedGuess)) {
      throw new ConvexError("Invalid guess format — must be exactly 5 letters");
    }
    if (!isValidWord(normalizedGuess)) {
      throw new ConvexError("Not in word list");
    }

    const secret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .unique();
    if (!secret) throw new ConvexError("Target word not configured for this game yet");

    const progress = await getPlayerProgress(ctx, game);
    const me = progress.find((player) => player.id === userId)!;

    if (me.hasWon) {
      throw new ConvexError("You already solved this word");
    }
    if (me.guessCount >= getMaxGuesses(mode)) {
      throw new ConvexError("Maximum guesses reached");
    }
    if (isTurnBased(game) && getTurnPlayerId(game, progress) !== userId) {
      throw new ConvexError("It's not your turn yet");
    }

    // Timed games work through a queue of words, one per solve.
    const wordIndex = mode === "timed" ? me.solvedCount : 0;
    const targetWord =
      mode === "timed" ? secret.targetWords?.[wordIndex] ?? secret.targetWord : secret.targetWord;
    const guessNumber = me.guessCount + 1;
    const evaluation = evaluateGuess(normalizedGuess, targetWord, mode);

    await ctx.db.insert("guesses", {
      gameId: args.gameId,
      playerId: userId,
      guess: normalizedGuess,
      evaluation,
      guessNumber,
      wordIndex,
    });

    const isCorrect = evaluation.every((e) => e === "correct");

    if (mode === "timed" && isCorrect && game.gameEndTime) {
      await ctx.db.patch(args.gameId, {
        gameEndTime: game.gameEndTime + TIMED_BONUS_MS,
      });
    }

    const finished = await settleGame(ctx, game);
    if (!finished && isTurnBased(game)) {
      await startNextTurn(ctx, game._id);
    }

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "guess submitted",
      properties: {
        game_id: args.gameId,
        game_type: game.gameType,
        mode: mode,
        guess_number: guessNumber,
        is_correct: isCorrect,
        word_index: wordIndex,
        ...(mode === "timed" && isCorrect ? { time_bonus_seconds: 25 } : {}),
      },
    });

    return { evaluation, isWon: isCorrect };
  },
});
