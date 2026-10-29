import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { auth } from "./auth";
import { getTodayKey } from "./dailyLimits";
import { MAX_TIMED_WORDS_PER_ROUND, isRoundInProgress, type LeaderboardMode } from "./leaderboardScoring";
import {
  getDailySeriesForUser,
  leaderboardModeValidator,
  recordSoloRoundResult,
  startSeriesRound,
} from "./leaderboards";
import { evaluateGuess, getRandomTargetWord, isValidGuessFormat } from "./shared/gameLogic";
import { isValidWord } from "./shared/words";

// Ranked solo rounds are played against the server: it picks the answer,
// scores every guess, hands out hints and keeps the timed clock, so the
// leaderboard reflects what actually happened rather than what a client
// claims happened.

type SoloRound = Doc<"soloRounds">;

const MAX_GUESSES = { classic: 6, hard: 10 } as const;
const TIMED_ROUND_MS = 75_000;
const TIMED_SOLVE_BONUS_MS = 25_000;
const TIMED_HINT_PENALTY_MS = 10_000;
// A guess sent just before the buzzer can arrive slightly after it.
const TIMED_GRACE_MS = 2_000;
const HARD_HINT_ELIMINATIONS = 3;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const getCurrentTarget = (round: SoloRound) =>
  round.targetWords[round.wordIndex % round.targetWords.length];

const countGreens = (evaluation: readonly string[]) =>
  evaluation.filter((status) => status === "correct").length;

const getMsRemaining = (round: Pick<SoloRound, "deadline">, now: number) =>
  round.deadline === undefined ? null : Math.max(0, round.deadline - now);

const toClientState = (round: SoloRound, now: number, resumed: boolean) => ({
  slot: round.slot,
  resumed,
  guesses: round.currentGuesses,
  totalGuesses: round.totalGuesses,
  wordsCompleted: round.wordsCompleted,
  hintUses: round.hintUses,
  eliminatedLetters: round.eliminatedLetters,
  msRemaining: getMsRemaining(round, now),
});

const getRoundForSlot = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  mode: LeaderboardMode,
  dayKey: string,
  slot: number,
) =>
  await ctx.db
    .query("soloRounds")
    .withIndex("by_user_mode_day_slot", (q) =>
      q.eq("userId", userId).eq("mode", mode).eq("dayKey", dayKey).eq("slot", slot),
    )
    .first();

// A player has at most one round in progress per mode. Look at their most
// recent rounds rather than today's only, so a round started just before
// midnight UTC can still be finished.
const getActiveRound = async (ctx: MutationCtx, userId: Id<"users">, mode: LeaderboardMode) => {
  const recentRounds = await ctx.db
    .query("soloRounds")
    .withIndex("by_user_mode_day_slot", (q) => q.eq("userId", userId).eq("mode", mode))
    .order("desc")
    .take(6);
  return recentRounds.find((round) => round.status === "in_progress") ?? null;
};

const requireActiveRound = async (
  ctx: MutationCtx,
  mode: LeaderboardMode,
  slot: number,
) => {
  const userId = await auth.getUserId(ctx);
  if (!userId) {
    throw new ConvexError("Must be logged in to play a ranked round");
  }
  const round = await getActiveRound(ctx, userId, mode);
  if (!round || round.slot !== slot) {
    throw new ConvexError("Ranked round is not active");
  }
  return round;
};

const createRoundState = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  mode: LeaderboardMode,
  dayKey: string,
  slot: number,
) => {
  const now = Date.now();
  const targetWords =
    mode === "timed"
      ? Array.from({ length: MAX_TIMED_WORDS_PER_ROUND }, () => getRandomTargetWord())
      : [getRandomTargetWord()];

  const roundId = await ctx.db.insert("soloRounds", {
    userId,
    mode,
    dayKey,
    slot,
    status: "in_progress",
    targetWords,
    wordIndex: 0,
    currentGuesses: [],
    totalGuesses: 0,
    hintUses: 0,
    eliminatedLetters: [],
    wordsCompleted: 0,
    lastGreenLetters: 0,
    startedAt: now,
    ...(mode === "timed" ? { deadline: now + TIMED_ROUND_MS } : {}),
  });

  if (mode === "timed") {
    // Ends the round even if the player closes the tab.
    await ctx.scheduler.runAfter(TIMED_ROUND_MS, internal.soloRounds.expireTimedRound, { roundId });
  }

  return (await ctx.db.get(roundId))!;
};

// Marks the round finished and records its result. `round` must already
// carry the final counters.
const finalizeRound = async (ctx: MutationCtx, round: SoloRound, won: boolean) => {
  await ctx.db.patch(round._id, { status: "finished", won, finishedAt: Date.now() });

  await recordSoloRoundResult(ctx, {
    userId: round.userId,
    dayKey: round.dayKey,
    slot: round.slot,
    result:
      round.mode === "timed"
        ? {
            mode: "timed",
            wordsCompleted: round.wordsCompleted,
            greenLetters: round.lastGreenLetters,
          }
        : {
            mode: round.mode,
            won,
            rawGuesses: round.currentGuesses.length,
            hintUses: round.hintUses,
            greenLetters: round.lastGreenLetters,
          },
  });
};

const isTimedRoundExpired = (round: SoloRound, now: number) =>
  round.mode === "timed" && round.deadline !== undefined && now > round.deadline + TIMED_GRACE_MS;

/** Starts the next ranked round for this mode, or resumes the one in progress. */
export const start = mutation({
  args: { mode: leaderboardModeValidator },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new ConvexError("Must be logged in to start a ranked round");
    }

    const now = Date.now();
    const activeRound = await getActiveRound(ctx, userId, args.mode);
    if (activeRound) {
      if (!isTimedRoundExpired(activeRound, now)) {
        return toClientState(activeRound, now, true);
      }
      // Its expiry job hasn't run yet; settle it before starting the next one.
      await finalizeRound(ctx, activeRound, activeRound.wordsCompleted > 0);
    }

    const dayKey = getTodayKey();
    const series = await getDailySeriesForUser(ctx, userId, args.mode, dayKey);
    const orphanedRound = series?.rounds.find((round) => isRoundInProgress(args.mode, round));
    if (orphanedRound) {
      // A round opened before rounds were tracked on the server has no
      // answer stored, so it restarts with a fresh word in the same slot.
      const existingState = await getRoundForSlot(ctx, userId, args.mode, dayKey, orphanedRound.slot);
      if (!existingState) {
        const round = await createRoundState(ctx, userId, args.mode, dayKey, orphanedRound.slot);
        return toClientState(round, now, false);
      }
    }

    const slot = await startSeriesRound(ctx, userId, args.mode, dayKey);
    const round = await createRoundState(ctx, userId, args.mode, dayKey, slot);
    return toClientState(round, now, false);
  },
});

/** Scores a guess against the round's answer. */
export const submitGuess = mutation({
  args: { mode: leaderboardModeValidator, slot: v.number(), guess: v.string() },
  handler: async (ctx, args) => {
    const round = await requireActiveRound(ctx, args.mode, args.slot);
    const now = Date.now();

    if (isTimedRoundExpired(round, now)) {
      await finalizeRound(ctx, round, round.wordsCompleted > 0);
      return {
        evaluation: null,
        solved: false,
        roundOver: true,
        won: round.wordsCompleted > 0,
        answer: getCurrentTarget(round),
        wordsCompleted: round.wordsCompleted,
        msRemaining: 0,
      };
    }

    const guess = args.guess.toUpperCase();
    if (!isValidGuessFormat(guess)) {
      throw new ConvexError("Guesses must be exactly 5 letters");
    }
    if (!isValidWord(guess)) {
      throw new ConvexError("Not in word list");
    }

    const answer = getCurrentTarget(round);
    const evaluation = evaluateGuess(guess, answer, round.mode);
    const solved = guess === answer;
    const currentGuesses = [...round.currentGuesses, { guess, evaluation }];
    const base = {
      totalGuesses: round.totalGuesses + 1,
      lastGreenLetters: countGreens(evaluation),
    };

    if (round.mode === "timed") {
      const updates = solved
        ? {
            ...base,
            wordIndex: round.wordIndex + 1,
            wordsCompleted: round.wordsCompleted + 1,
            currentGuesses: [],
            eliminatedLetters: [],
            hintTurn: undefined,
            deadline: (round.deadline ?? now) + TIMED_SOLVE_BONUS_MS,
          }
        : { ...base, currentGuesses };
      await ctx.db.patch(round._id, updates);
      const updated = { ...round, ...updates };
      return {
        evaluation,
        solved,
        roundOver: false,
        won: false,
        answer: null,
        wordsCompleted: updated.wordsCompleted,
        msRemaining: getMsRemaining(updated, now),
      };
    }

    const roundOver = solved || currentGuesses.length >= MAX_GUESSES[round.mode];
    await ctx.db.patch(round._id, { ...base, currentGuesses });
    if (roundOver) {
      await finalizeRound(ctx, { ...round, ...base, currentGuesses }, solved);
    }

    return {
      evaluation,
      solved,
      roundOver,
      won: solved,
      answer: roundOver ? answer : null,
      wordsCompleted: 0,
      msRemaining: null,
    };
  },
});

/** Spends a hint: reveals a letter (classic, timed) or rules out letters (hard). */
export const spendHint = mutation({
  args: { mode: leaderboardModeValidator, slot: v.number() },
  handler: async (ctx, args) => {
    const round = await requireActiveRound(ctx, args.mode, args.slot);
    const now = Date.now();

    if (isTimedRoundExpired(round, now)) {
      await finalizeRound(ctx, round, round.wordsCompleted > 0);
      return {
        kind: "round_over" as const,
        wordsCompleted: round.wordsCompleted,
        answer: getCurrentTarget(round),
      };
    }
    if (round.currentGuesses.length === 0) {
      throw new ConvexError("Make your first guess to unlock hints!");
    }
    if (round.hintTurn === round.currentGuesses.length) {
      throw new ConvexError("You can only use one hint per guess! Make another guess first.");
    }

    const answer = getCurrentTarget(round);

    if (round.mode === "hard") {
      const answerLetters = new Set(answer.split(""));
      const candidates = ALPHABET.filter(
        (letter) => !answerLetters.has(letter) && !round.eliminatedLetters.includes(letter),
      );
      if (candidates.length === 0) {
        throw new ConvexError("No more letters to eliminate!");
      }
      const letters = shuffle(candidates).slice(0, HARD_HINT_ELIMINATIONS);
      await ctx.db.patch(round._id, {
        eliminatedLetters: [...round.eliminatedLetters, ...letters],
        hintUses: round.hintUses + 1,
        hintTurn: round.currentGuesses.length,
      });
      return { kind: "eliminate" as const, letters };
    }

    const knownPositions = new Set<number>();
    for (const { evaluation } of round.currentGuesses) {
      evaluation.forEach((status, index) => {
        if (status === "correct") knownPositions.add(index);
      });
    }
    const openPositions = [0, 1, 2, 3, 4].filter((index) => !knownPositions.has(index));
    if (openPositions.length === 0) {
      throw new ConvexError("All letters are already revealed!");
    }
    const position = openPositions[Math.floor(Math.random() * openPositions.length)];

    if (round.mode === "timed") {
      // Timed hints cost time instead of counting against the score.
      const deadline = (round.deadline ?? now) - TIMED_HINT_PENALTY_MS;
      await ctx.db.patch(round._id, { deadline, hintTurn: round.currentGuesses.length });
      if (deadline <= now) {
        await finalizeRound(ctx, { ...round, deadline }, round.wordsCompleted > 0);
        return { kind: "round_over" as const, wordsCompleted: round.wordsCompleted, answer };
      }
      return {
        kind: "reveal" as const,
        position,
        letter: answer[position],
        msRemaining: deadline - now,
      };
    }

    await ctx.db.patch(round._id, {
      hintUses: round.hintUses + 1,
      hintTurn: round.currentGuesses.length,
    });
    return { kind: "reveal" as const, position, letter: answer[position], msRemaining: null };
  },
});

/** Ends a timed round once the clock has run out (or the player stops early). */
export const finishTimed = mutation({
  args: { slot: v.number() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new ConvexError("Must be logged in to finish a ranked round");
    }

    const activeRound = await getActiveRound(ctx, userId, "timed");
    if (activeRound && activeRound.slot === args.slot) {
      await finalizeRound(ctx, activeRound, activeRound.wordsCompleted > 0);
      return { wordsCompleted: activeRound.wordsCompleted, answer: getCurrentTarget(activeRound) };
    }

    // Already settled by the expiry job: report what was recorded.
    const recent = await ctx.db
      .query("soloRounds")
      .withIndex("by_user_mode_day_slot", (q) => q.eq("userId", userId).eq("mode", "timed"))
      .order("desc")
      .take(6);
    const finished = recent.find((round) => round.slot === args.slot);
    if (!finished) {
      throw new ConvexError("Ranked round not found");
    }
    return { wordsCompleted: finished.wordsCompleted, answer: getCurrentTarget(finished) };
  },
});

export const expireTimedRound = internalMutation({
  args: { roundId: v.id("soloRounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round || round.status !== "in_progress" || round.deadline === undefined) {
      return;
    }

    const now = Date.now();
    if (round.deadline + TIMED_GRACE_MS > now) {
      // Solves pushed the deadline back since this was scheduled.
      await ctx.scheduler.runAfter(
        round.deadline + TIMED_GRACE_MS - now,
        internal.soloRounds.expireTimedRound,
        args,
      );
      return;
    }

    await finalizeRound(ctx, round, round.wordsCompleted > 0);
  },
});

const shuffle = <T>(values: readonly T[]) => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};
