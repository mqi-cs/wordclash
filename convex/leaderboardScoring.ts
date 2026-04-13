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

    const wordsCompleted = Math.max(0, round.wordsCompleted ?? round.adjustedScore ?? 0);
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

  return {
    slot: round.slot,
    status: round.status,
    startedAt: round.startedAt,
    ...(round.finishedAt ? { finishedAt: round.finishedAt } : {}),
    ...(round.importedFromGuest ? { importedFromGuest: true } : {}),
    ...(typeof round.rawGuesses === "number" ? { rawGuesses: round.rawGuesses } : {}),
    ...(typeof round.hintUses === "number" ? { hintUses: round.hintUses } : {}),
    ...(typeof round.adjustedScore === "number" ? { adjustedScore: round.adjustedScore } : {}),
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
