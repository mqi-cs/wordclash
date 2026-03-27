import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { auth } from "./auth";
import { evaluateGuess, isValidGuessFormat } from "./shared/gameLogic";

type GameDoc = Doc<"games">;

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
    if (!userId) throw new Error("Unauthorized");

    // Verify the caller is in this game
    const game = await ctx.db.get(args.gameId);
    if (!game) return [];
    if (!isParticipant(game, userId)) {
      throw new Error("You are not part of this game");
    }

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

    if (!isParticipant(game, userId)) {
      throw new Error("You are not part of this game");
    }

    if (game.status !== "in_progress") {
      throw new Error("Game is not active");
    }

    const normalizedGuess = args.guess.toUpperCase();

    if (!isValidGuessFormat(normalizedGuess)) {
      throw new Error("Invalid guess format — must be exactly 5 letters");
    }

    const secret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .unique();

    if (!secret) {
      throw new Error("Target word not configured for this game yet");
    }

    const existingGuesses = await ctx.db
      .query("guesses")
      .withIndex("by_game_and_player", (q) => q.eq("gameId", args.gameId).eq("playerId", userId))
      .collect();

    const guessNumber = existingGuesses.length + 1;

    if (guessNumber > 6) {
      throw new Error("Maximum guesses reached");
    }

    const evaluation = evaluateGuess(normalizedGuess, secret.targetWord, game.gameType);
    const validEvaluation = evaluation as Array<"correct" | "present" | "absent">;

    await ctx.db.insert("guesses", {
      gameId: args.gameId,
      playerId: userId,
      guess: normalizedGuess,
      evaluation: validEvaluation,
      guessNumber,
    });

    const isWon = validEvaluation.every(e => e === "correct");
    if (isWon) {
      await ctx.db.patch(args.gameId, {
        status: "finished",
        winnerId: userId,
        finishedAt: Date.now()
      });
    } else if (guessNumber >= 6) {
      const otherPlayers = getGamePlayerIds(game).filter((playerId) => playerId !== userId);
      let everyPlayerFinished = true;

      for (const playerId of otherPlayers) {
        const playerGuesses = await ctx.db
          .query("guesses")
          .withIndex("by_game_and_player", (q) =>
            q.eq("gameId", args.gameId).eq("playerId", playerId),
          )
          .collect();

        if (playerGuesses.length < 6) {
          everyPlayerFinished = false;
          break;
        }
      }

      if (everyPlayerFinished) {
        await ctx.db.patch(args.gameId, {
          status: "finished",
          finishedAt: Date.now()
        });
      }
    }

    return { evaluation: validEvaluation, isWon };
  },
});
