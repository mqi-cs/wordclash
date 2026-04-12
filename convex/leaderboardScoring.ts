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
  rounds: Array<Pick<LeaderboardRoundLike, "status" | "hintUses" | "wordsCompleted" | "adjustedScore" | "finishedAt" | "slot">>,
  requiredRounds: number,
): LeaderboardSeriesSummary => {
  const sortedRounds = [...rounds].sort((a, b) => a.slot - b.slot);
  const totalHintsUsed = sortedRounds.reduce((total, round) => total + (round.hintUses ?? 0), 0);
  const hasInProgress = sortedRounds.some((round) => isRoundInProgress(mode, round));
  const hasAbandoned = sortedRounds.some((round) => round.status === "abandoned");
  const hasFailedClassicRound =
    mode !== "timed" && sortedRounds.some((round) => round.status === "lost");
  const isComplete = sortedRounds.length >= requiredRounds && !hasInProgress;

  if (hasAbandoned || hasFailedClassicRound) {
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

  const totalScore = sortedRounds.reduce((total, round) => {
    if (mode === "timed") {
      return total + (round.wordsCompleted ?? round.adjustedScore ?? 0);
    }
    return total + (round.adjustedScore ?? 0);
  }, 0);

  const completedAt = sortedRounds.reduce(
    (latest, round) => Math.max(latest, round.finishedAt ?? 0),
    0,
  );

  return {
    rankingStatus: "qualified",
    totalScore,
    sortScore: mode === "timed" ? -totalScore : totalScore,
    totalHintsUsed,
    completedAt,
  };
};
