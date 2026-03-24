import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { evaluateGuess } from "../src/lib/gameLogic";

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

    // Evaluate the guess on the server natively! (No cheating)
    const evaluation = evaluateGuess(args.guess.toUpperCase(), secret.targetWord, game.gameType);

    // Ensure evaluation matches the type expected by schema
    // The evaluateGuess returns ("correct" | "present" | "absent")[]
    // Schema expects the same.
    const validEvaluation = evaluation as Array<"correct" | "present" | "absent">;

    // Insert the guess
    await ctx.db.insert("guesses", {
      gameId: args.gameId,
      playerId: userId,
      guess: args.guess.toUpperCase(),
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
    } else if (guessNumber >= 6) { // Max 6 guesses 
      // Need to check if BOTH players have used 6 guesses, or if one player losing means game over
      // For standard 'race', one player exhausting guesses doesn't end the game for the other unless rules say so.
      // But we can check if both haven't won and both reached 6.
      
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
          }); // draw
        }
      }
    }

    return { evaluation: validEvaluation, isWon };
  },
});
