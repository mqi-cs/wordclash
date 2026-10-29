import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { auth } from "./auth";
import { evaluateGuess, isValidGuessFormat } from "./shared/gameLogic";
import { internal } from "./_generated/api";

type GameDoc = Doc<"games">;
const TIMED_BONUS_MS = 25 * 1000;

const getGamePlayerIds = (game: GameDoc): Id<"users">[] =>
  [game.player1Id, game.player2Id, game.player3Id, game.player4Id].filter(
    (playerId): playerId is Id<"users"> => playerId !== undefined,
  );

const isParticipant = (game: GameDoc, userId: Id<"users">) =>
  getGamePlayerIds(game).includes(userId);

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

    const secret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .unique();
    if (!secret) throw new ConvexError("Target word not configured for this game yet");

    const existingGuesses = await ctx.db
      .query("guesses")
      .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId).eq("playerId", userId))
      .collect();

    // Determine current word index and target word
    const solvedCount = existingGuesses.filter(g =>
      g.evaluation.every(e => e === "correct")
    ).length;

    let wordIndex = 0;
    let targetWord = secret.targetWord;

    if (mode === "timed") {
      wordIndex = solvedCount;
      if (secret.targetWords && secret.targetWords[wordIndex]) {
        targetWord = secret.targetWords[wordIndex];
      }
    }

    if (mode !== "timed" && solvedCount > 0) {
      throw new ConvexError("You already solved this word");
    }

    const guessesOnCurrentWord = existingGuesses.filter(g => (g.wordIndex ?? 0) === wordIndex);
    const guessNumber = guessesOnCurrentWord.length + 1;

    const maxGuesses = mode === "hard" ? 10 : mode === "timed" ? 999 : 6;

    if (guessNumber > maxGuesses) {
      throw new ConvexError("Maximum guesses reached");
    }

    // Classic/hard challenges are turn-based: the host goes first and players
    // alternate. Mirrors the turn logic in MultiplayerGame.
    if (game.gameType === "challenge" && mode !== "timed") {
      const opponentId = getGamePlayerIds(game).find((playerId) => playerId !== userId);
      if (opponentId) {
        const opponentGuesses = await ctx.db
          .query("guesses")
          .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId).eq("playerId", opponentId))
          .collect();
        const isMyTurn =
          existingGuesses.length === opponentGuesses.length
            ? game.player1Id === userId
            : existingGuesses.length < opponentGuesses.length;
        if (!isMyTurn) {
          throw new ConvexError("It's not your turn yet");
        }
      }
    }

    const evaluation = evaluateGuess(normalizedGuess, targetWord, mode);
    const validEvaluation = evaluation as Array<"correct" | "present" | "absent">;

    await ctx.db.insert("guesses", {
      gameId: args.gameId,
      playerId: userId,
      guess: normalizedGuess,
      evaluation: validEvaluation,
      guessNumber,
      wordIndex,
    });

    const isCorrect = validEvaluation.every(e => e === "correct");

    if (mode === "timed" && isCorrect && game.gameEndTime) {
      await ctx.db.patch(args.gameId, {
        gameEndTime: game.gameEndTime + TIMED_BONUS_MS,
      });
    }

    // Check if the game should finish
    const players = getGamePlayerIds(game);
    const playerSummaries = await Promise.all(players.map(async (playerId) => {
      const pGuesses = await ctx.db
        .query("guesses")
        .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId).eq("playerId", playerId))
        .collect();

      const solved = pGuesses.filter(g => g.evaluation.every(e => e === "correct"));
      const latestWordIndex = (mode === "timed") ? solved.length : 0;
      const onLatestWord = pGuesses.filter(g => (g.wordIndex ?? 0) === latestWordIndex);

      const hasWon = (mode !== "timed") && solved.length > 0;
      const isOut = (mode !== "timed") && onLatestWord.length >= maxGuesses;

      // In classic/hard, a player is done if they won or are out of guesses.
      // In timed, a player is only done when time is up.
      const isDone = (mode === "timed") ? (game.gameEndTime ? Date.now() > game.gameEndTime : false) : (hasWon || isOut);

      return {
        id: playerId,
        isDone,
        hasWon,
        attempts: hasWon ? onLatestWord.length : 999, // Attempts for the word solved
        guessCount: onLatestWord.length,
        solvedCount: solved.length,
      };
    }));

    // In a turn-based challenge, once someone has solved it the other player
    // only gets to match their number of guesses. Without this the game
    // stalls: the solver can't move and it is never the other player's turn.
    if (game.gameType === "challenge" && mode !== "timed") {
      const winningAttempts = playerSummaries
        .filter(p => p.hasWon)
        .map(p => p.attempts);
      if (winningAttempts.length > 0) {
        const fewestWinningAttempts = Math.min(...winningAttempts);
        for (const summary of playerSummaries) {
          if (!summary.isDone && summary.guessCount >= fewestWinningAttempts) {
            summary.isDone = true;
          }
        }
      }
    }

    const allDone = playerSummaries.every(p => p.isDone);

    if (allDone) {
      let winnerId: Id<"users"> | undefined = undefined;
      let isDraw = false;

      if (mode === "timed") {
        // Winner is the one with most solvedCount
        playerSummaries.sort((a, b) => b.solvedCount - a.solvedCount);
        if (playerSummaries.length > 1 && playerSummaries[0].solvedCount === playerSummaries[1].solvedCount) {
          isDraw = true;
        } else {
          winnerId = playerSummaries[0].id;
        }
      } else {
        // Winner is the one with hasWon=true and lowest attempts
        const winners = playerSummaries.filter(p => p.hasWon).sort((a, b) => a.attempts - b.attempts);
        if (winners.length === 0) {
          isDraw = true; // Nobody guessed it
        } else if (winners.length > 1 && winners[0].attempts === winners[1].attempts) {
          isDraw = true;
        } else {
          winnerId = winners[0].id;
        }
      }

      await ctx.db.patch(args.gameId, {
        status: "finished",
        winnerId,
        isDraw,
        finishedAt: Date.now(),
      });
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

    return { evaluation: validEvaluation, isWon: isCorrect };
  },
});
