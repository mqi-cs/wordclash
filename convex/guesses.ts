import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { evaluateGuess, isValidGuessFormat } from "./shared/gameLogic";

export const getGuesses = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const guesses = await ctx.db
      .query("guesses")
      .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId))
      .collect();
      
    return guesses.sort((a, b) => a.guessNumber - b.guessNumber);
  },
});

export const submitGuess = mutation({
  args: { gameId: v.id("games"), guess: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    
    // Only players in the game can guess
    if (game.player1Id !== userId && game.player2Id !== userId) {
      throw new Error("You are not part of this game");
    }

    if (game.status !== "in_progress") {
      throw new Error("Game is not active");
    }

    const normalizedGuess = args.guess.toUpperCase();

    // Validate guess format (must be exactly 5 uppercase letters)
    if (!isValidGuessFormat(normalizedGuess)) {
      throw new Error("Invalid guess format — must be exactly 5 letters");
    }

    // Get the target secret word for this game
    const secret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .unique();

    if (!secret) {
      throw new Error("Target word not configured for this game yet");
    }

    // Get my previous guesses to count guessNumber
    const existingGuesses = await ctx.db
      .query("guesses")
      .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId).eq("playerId", userId))
      .collect();

    const guessNumber = existingGuesses.length + 1;

    if (guessNumber > 6) {
      throw new Error("Maximum guesses reached");
    }

    // Evaluate the guess on the server (No cheating!)
    const evaluation = evaluateGuess(normalizedGuess, secret.targetWord, game.gameType);
    const validEvaluation = evaluation as Array<"correct" | "present" | "absent">;

    // Insert the guess
    await ctx.db.insert("guesses", {
      gameId: args.gameId,
      playerId: userId,
      guess: normalizedGuess,
      evaluation: validEvaluation,
      guessNumber,
    });

    // Determine if game is won
    const isWon = validEvaluation.every(e => e === "correct");
    if (isWon) {
      await ctx.db.patch(args.gameId, {
        status: "finished",
        winnerId: userId,
        finishedAt: Date.now()
      });
    } else if (guessNumber >= 6) {
      // Check if both players have exhausted their guesses
      const opponentId = game.player1Id === userId ? game.player2Id : game.player1Id;
      if (opponentId) {
        const oppGuesses = await ctx.db
          .query("guesses")
          .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId).eq("playerId", opponentId))
          .collect();

        if (oppGuesses.length >= 6) {
          await ctx.db.patch(args.gameId, {
            status: "finished",
            finishedAt: Date.now()
          }); // draw — no winnerId
        }
      }
    }

    return { evaluation: validEvaluation, isWon };
  },
});
