export type LeaderboardMode = "classic" | "hard" | "timed";
export type RankingStatus = "in_progress" | "qualified" | "disqualified";
export type RoundStatus = "in_progress" | "won" | "lost" | "abandoned";

export type LeaderboardRoundLike = {
  slot: number;
  status: RoundStatus;
  rawGuesses?: number;
  hintUses?: number;
  adjustedScore?: number;
  wordsCompleted?: number;
  startedAt: number;
  finishedAt?: number;
  importedFromGuest?: boolean;
};

export type LeaderboardSeriesSummary = {
  rankingStatus: RankingStatus;
  totalScore?: number;
  sortScore?: number;
  totalHintsUsed: number;
  completedAt?: number;
};

const CLASSIC_HARD_SOLVE_WEIGHT = 1_000_000;
const MAX_GUESSES_BY_MODE = { classic: 6, hard: 10 } as const;
// Far above anything reachable in a 75s round plus bonuses; it only exists to
// stop absurd client-reported values from topping the board.
export const MAX_TIMED_WORDS_PER_ROUND = 100;

// Round results are reported by the client, so every number is forced into
// the range the game can actually produce before it is scored.
const clampInteger = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.round(value), min), max) : min;

const getSolvedWords = (
  mode: LeaderboardMode,
  rounds: Array<Pick<LeaderboardRoundLike, "status">>,
) => {
  if (mode === "timed") {
    return undefined;
  }

  return rounds.reduce((total, round) => total + (round.status === "won" ? 1 : 0), 0);
};

const getSolvedGuessTotal = (
  mode: LeaderboardMode,
  rounds: Array<Pick<LeaderboardRoundLike, "status" | "rawGuesses" | "adjustedScore">>,
) => {
  if (mode === "timed") {
    return undefined;
  }

  return rounds.reduce((total, round) => {
    if (round.status !== "won") {
      return total;
    }

    return total + (round.rawGuesses ?? round.adjustedScore ?? 0);
  }, 0);
};

const getClassicHardSortScore = (
  requiredRounds: number,
  solvedWords: number,
  solvedGuessTotal: number,
) => (requiredRounds - solvedWords) * CLASSIC_HARD_SOLVE_WEIGHT + solvedGuessTotal;

export const isRoundInProgress = (
  mode: LeaderboardMode,
  round: Pick<LeaderboardRoundLike, "status" | "finishedAt">,
) =>
  round.status === "in_progress" ||
  (mode === "timed" && round.status !== "abandoned" && round.finishedAt === undefined);

export const normalizeRoundForMode = (
  mode: LeaderboardMode,
  round: LeaderboardRoundLike,
): LeaderboardRoundLike => {
  if (mode === "timed") {
    if (round.status === "in_progress") {
      return {
        slot: round.slot,
        status: "in_progress",
        startedAt: round.startedAt,
        ...(round.importedFromGuest ? { importedFromGuest: true } : {}),
      };
    }

    const wordsCompleted = clampInteger(
      round.wordsCompleted ?? round.adjustedScore ?? 0,
      0,
      MAX_TIMED_WORDS_PER_ROUND,
    );
    return {
      slot: round.slot,
      status: round.status === "abandoned" ? "abandoned" : "won",
      startedAt: round.startedAt,
      ...(round.finishedAt ? { finishedAt: round.finishedAt } : {}),
      ...(round.importedFromGuest ? { importedFromGuest: true } : {}),
      ...(round.status === "abandoned"
        ? {}
        : {
            wordsCompleted,
            adjustedScore: wordsCompleted,
            hintUses: 0,
          }),
    };
  }

  const maxGuesses = MAX_GUESSES_BY_MODE[mode];
  // A solved word took at least one guess; at most one hint per guess.
  const minScore = round.status === "won" ? 1 : 0;
  return {
    slot: round.slot,
    status: round.status,
    startedAt: round.startedAt,
    ...(round.finishedAt ? { finishedAt: round.finishedAt } : {}),
    ...(round.importedFromGuest ? { importedFromGuest: true } : {}),
    ...(typeof round.rawGuesses === "number"
      ? { rawGuesses: clampInteger(round.rawGuesses, minScore, maxGuesses) }
      : {}),
    ...(typeof round.hintUses === "number"
      ? { hintUses: clampInteger(round.hintUses, 0, maxGuesses) }
      : {}),
    ...(typeof round.adjustedScore === "number"
      ? { adjustedScore: clampInteger(round.adjustedScore, minScore, maxGuesses * 2) }
      : {}),
  };
};

export const summarizeSeries = (
  mode: LeaderboardMode,
  rounds: Array<
    Pick<
      LeaderboardRoundLike,
      "status" | "hintUses" | "wordsCompleted" | "adjustedScore" | "rawGuesses" | "finishedAt" | "slot"
    >
  >,
  requiredRounds: number,
): LeaderboardSeriesSummary => {
  const sortedRounds = [...rounds].sort((a, b) => a.slot - b.slot);
  const totalHintsUsed = sortedRounds.reduce((total, round) => total + (round.hintUses ?? 0), 0);
  const hasInProgress = sortedRounds.some((round) => isRoundInProgress(mode, round));
  const hasAbandoned = sortedRounds.some((round) => round.status === "abandoned");
  const isComplete = sortedRounds.length >= requiredRounds && !hasInProgress;

  if (hasAbandoned) {
    return {
      rankingStatus: "disqualified",
      totalHintsUsed,
      completedAt: sortedRounds
        .filter((round) => typeof round.finishedAt === "number")
        .reduce((latest, round) => Math.max(latest, round.finishedAt ?? 0), 0),
    };
  }

  if (!isComplete) {
    return {
      rankingStatus: "in_progress",
      totalHintsUsed,
    };
  }

  const totalScore =
    mode === "timed"
      ? sortedRounds.reduce(
          (total, round) => total + (round.wordsCompleted ?? round.adjustedScore ?? 0),
          0,
        )
      : getSolvedGuessTotal(mode, sortedRounds) ?? 0;

  const completedAt = sortedRounds.reduce(
    (latest, round) => Math.max(latest, round.finishedAt ?? 0),
    0,
  );
  const solvedWords = getSolvedWords(mode, sortedRounds);

  return {
    rankingStatus: "qualified",
    totalScore,
    sortScore:
      mode === "timed"
        ? -totalScore
        : getClassicHardSortScore(requiredRounds, solvedWords ?? 0, totalScore),
    totalHintsUsed,
    completedAt,
  };
};
