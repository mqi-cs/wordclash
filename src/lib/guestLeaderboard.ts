export type GuestLeaderboardMode = "classic" | "hard" | "timed";
export type GuestLeaderboardRoundStatus = "in_progress" | "won" | "lost" | "abandoned";
export type GuestLeaderboardRankingStatus = "in_progress" | "qualified" | "disqualified";

export type GuestLeaderboardRound = {
  slot: number;
  status: GuestLeaderboardRoundStatus;
  rawGuesses?: number;
  hintUses?: number;
  adjustedScore?: number;
  wordsCompleted?: number;
  startedAt: number;
  finishedAt?: number;
};

export type GuestLeaderboardSeries = {
  mode: GuestLeaderboardMode;
  dayKey: string;
  rankingStatus: GuestLeaderboardRankingStatus;
  totalScore?: number;
  sortScore?: number;
  totalHintsUsed: number;
  completedAt?: number;
  rounds: GuestLeaderboardRound[];
};

type GuestLeaderboardStorage = {
  dayKey: string;
  modes: Partial<Record<GuestLeaderboardMode, GuestLeaderboardSeries>>;
};

const STORAGE_KEY = "wordclash_guest_leaderboard_v1";
const STORAGE_EVENT = "wordclash:guest-leaderboard-updated";
const MAX_ROUNDS = 3;
const CLASSIC_HARD_SOLVE_WEIGHT = 1_000_000;

const getTodayKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
};

const createEmptyStorage = (dayKey = getTodayKey()): GuestLeaderboardStorage => ({
  dayKey,
  modes: {},
});

const dispatchStorageUpdate = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
};

const summarizeSeries = (
  mode: GuestLeaderboardMode,
  rounds: GuestLeaderboardRound[],
): Pick<
  GuestLeaderboardSeries,
  "rankingStatus" | "totalScore" | "sortScore" | "totalHintsUsed" | "completedAt"
> => {
  const sortedRounds = [...rounds].sort((a, b) => a.slot - b.slot);
  const totalHintsUsed = sortedRounds.reduce((total, round) => total + (round.hintUses ?? 0), 0);
  const hasInProgress = sortedRounds.some((round) => round.status === "in_progress");
  const hasAbandoned = sortedRounds.some((round) => round.status === "abandoned");
  const isComplete = sortedRounds.length >= MAX_ROUNDS && !hasInProgress;

  if (hasAbandoned) {
    return {
      rankingStatus: "disqualified",
      totalHintsUsed,
      completedAt: sortedRounds.reduce(
        (latest, round) => Math.max(latest, round.finishedAt ?? 0),
        0,
      ),
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
      : sortedRounds.reduce((total, round) => {
          if (round.status !== "won") {
            return total;
          }

          return total + (round.rawGuesses ?? round.adjustedScore ?? 0);
        }, 0);
  const solvedWords =
    mode === "timed"
      ? undefined
      : sortedRounds.reduce((total, round) => total + (round.status === "won" ? 1 : 0), 0);

  return {
    rankingStatus: "qualified",
    totalScore,
    sortScore:
      mode === "timed"
        ? -totalScore
        : (MAX_ROUNDS - (solvedWords ?? 0)) * CLASSIC_HARD_SOLVE_WEIGHT + totalScore,
    totalHintsUsed,
    completedAt: sortedRounds.reduce(
      (latest, round) => Math.max(latest, round.finishedAt ?? 0),
      0,
    ),
  };
};

const normalizeTimedRound = (
  round: GuestLeaderboardRound,
  wordsCompleted: number,
): GuestLeaderboardRound => ({
  slot: round.slot,
  status: round.status === "abandoned" ? "abandoned" : "won",
  startedAt: round.startedAt,
  ...(round.finishedAt ? { finishedAt: round.finishedAt } : {}),
  wordsCompleted,
  adjustedScore: wordsCompleted,
  hintUses: 0,
});

const normalizeStorage = (storage: GuestLeaderboardStorage): GuestLeaderboardStorage => {
  const todayKey = getTodayKey();
  if (storage.dayKey !== todayKey) {
    return createEmptyStorage(todayKey);
  }

  const normalizedModes = Object.fromEntries(
    Object.entries(storage.modes).map(([mode, series]) => [
      mode,
      series ? upsertSeries(mode as GuestLeaderboardMode, series.rounds) : series,
    ]),
  ) as GuestLeaderboardStorage["modes"];

  return {
    dayKey: storage.dayKey,
    modes: normalizedModes,
  };
};

const readStorage = (): GuestLeaderboardStorage => {
  if (typeof window === "undefined") {
    return createEmptyStorage();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyStorage();
    }

    const parsed = JSON.parse(raw) as Partial<GuestLeaderboardStorage>;
    return normalizeStorage({
      dayKey: parsed.dayKey ?? getTodayKey(),
      modes: parsed.modes ?? {},
    });
  } catch {
    return createEmptyStorage();
  }
};

const writeStorage = (value: GuestLeaderboardStorage) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  dispatchStorageUpdate();
};

const upsertSeries = (
  mode: GuestLeaderboardMode,
  rounds: GuestLeaderboardRound[],
): GuestLeaderboardSeries => {
  const dayKey = getTodayKey();
  const sortedRounds = [...rounds].sort((a, b) => a.slot - b.slot);
  const summary = summarizeSeries(mode, sortedRounds);

  return {
    mode,
    dayKey,
    rounds: sortedRounds,
    rankingStatus: summary.rankingStatus,
    totalHintsUsed: summary.totalHintsUsed,
    ...(summary.totalScore !== undefined ? { totalScore: summary.totalScore } : {}),
    ...(summary.sortScore !== undefined ? { sortScore: summary.sortScore } : {}),
    ...(summary.completedAt !== undefined ? { completedAt: summary.completedAt } : {}),
  };
};

export const getGuestLeaderboardSeries = (mode: GuestLeaderboardMode): GuestLeaderboardSeries | null => {
  const storage = readStorage();
  return storage.modes[mode] ?? null;
};

export const startGuestLeaderboardRound = (mode: GuestLeaderboardMode) => {
  const storage = readStorage();
  const currentSeries = storage.modes[mode];

  if (currentSeries?.rounds.some((round) => round.status === "in_progress")) {
    throw new Error("Finish or abandon your current round first.");
  }

  const nextSlot = (currentSeries?.rounds.length ?? 0) + 1;
  if (nextSlot > MAX_ROUNDS) {
    throw new Error(`Daily limit reached for ${mode} mode. Come back tomorrow.`);
  }

  const nextRounds = [
    ...(currentSeries?.rounds ?? []),
    {
      slot: nextSlot,
      status: "in_progress" as const,
      startedAt: Date.now(),
    },
  ];

  writeStorage({
    dayKey: storage.dayKey,
    modes: {
      ...storage.modes,
      [mode]: upsertSeries(mode, nextRounds),
    },
  });

  return nextSlot;
};

export const finishGuestLeaderboardRound = (args: {
  mode: GuestLeaderboardMode;
  slot: number;
  won: boolean;
  rawGuesses?: number;
  hintUses?: number;
  wordsCompleted?: number;
}) => {
  const storage = readStorage();
  const currentSeries = storage.modes[args.mode];
  if (!currentSeries) {
    return null;
  }

  const targetRound = currentSeries.rounds.find((round) => round.slot === args.slot);
  if (!targetRound || targetRound.status !== "in_progress") {
    return currentSeries;
  }

  const finishedAt = Date.now();
  const nextRounds = currentSeries.rounds.map((round) => {
    if (round.slot !== args.slot) {
      return round;
    }

    if (args.mode === "timed") {
      return normalizeTimedRound(
        {
          ...round,
          finishedAt,
        },
        Math.max(0, args.wordsCompleted ?? 0),
      );
    }

    const rawGuesses = args.rawGuesses ?? 0;
    const hintUses = Math.max(0, args.hintUses ?? 0);

    return {
      slot: args.slot,
      status: args.won ? "won" : "lost",
      startedAt: round.startedAt,
      finishedAt,
      rawGuesses,
      hintUses,
      adjustedScore: rawGuesses + hintUses,
    } satisfies GuestLeaderboardRound;
  });

  const nextSeries = upsertSeries(args.mode, nextRounds);
  writeStorage({
    dayKey: storage.dayKey,
    modes: {
      ...storage.modes,
      [args.mode]: nextSeries,
    },
  });

  return nextSeries;
};

export const abandonGuestLeaderboardRound = (mode: GuestLeaderboardMode, slot: number) => {
  const storage = readStorage();
  const currentSeries = storage.modes[mode];
  if (!currentSeries) {
    return null;
  }

  const targetRound = currentSeries.rounds.find((round) => round.slot === slot);
  if (!targetRound || targetRound.status !== "in_progress") {
    return currentSeries;
  }

  const nextRounds = currentSeries.rounds.map((round) =>
    round.slot === slot
      ? ({
          slot,
          status: "abandoned",
          startedAt: round.startedAt,
          finishedAt: Date.now(),
        } satisfies GuestLeaderboardRound)
      : round,
  );

  const nextSeries = upsertSeries(mode, nextRounds);
  writeStorage({
    dayKey: storage.dayKey,
    modes: {
      ...storage.modes,
      [mode]: nextSeries,
    },
  });

  return nextSeries;
};

export const clearGuestLeaderboardSeries = (mode: GuestLeaderboardMode) => {
  const storage = readStorage();
  if (!storage.modes[mode]) {
    return;
  }

  const nextModes = { ...storage.modes };
  delete nextModes[mode];

  writeStorage({
    dayKey: storage.dayKey,
    modes: nextModes,
  });
};

export const getGuestLeaderboardImportPayloads = () => {
  const storage = readStorage();

  return (Object.entries(storage.modes) as Array<[GuestLeaderboardMode, GuestLeaderboardSeries]>)
    .filter(([, series]) => series.rounds.length > 0)
    .map(([mode, series]) => ({
      mode,
      dayKey: series.dayKey,
      rounds: series.rounds,
    }));
};

export const subscribeToGuestLeaderboard = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => callback();
  window.addEventListener(STORAGE_EVENT, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(STORAGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
};
