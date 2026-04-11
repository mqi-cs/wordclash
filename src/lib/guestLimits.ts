import { GameMode } from "@/components/GameMenu";

export type LimitedGameMode = Exclude<GameMode, "multiplayer">;

export type ModeLimitStatus = {
  played: number;
  remaining: number;
  reached: boolean;
};

export type DailyModeLimits = {
  dayKey: string;
  limit: number;
  modes: Record<LimitedGameMode, ModeLimitStatus>;
};

type GuestLimitStorage = {
  dayKey: string;
  counts: Partial<Record<LimitedGameMode, number>>;
};

const STORAGE_KEY = "wordclash_guest_daily_mode_rounds_v1";
const STORAGE_EVENT = "wordclash:guest-daily-mode-rounds-updated";
export const DAILY_MODE_ROUND_LIMIT = 3;
const LIMITED_MODES: LimitedGameMode[] = ["classic", "hard", "timed"];

const getTodayKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
};

const createEmptyStorage = (dayKey = getTodayKey()): GuestLimitStorage => ({
  dayKey,
  counts: {},
});

const dispatchStorageUpdate = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
};

const loadStorage = (): GuestLimitStorage => {
  if (typeof window === "undefined") {
    return createEmptyStorage();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyStorage();
    }

    const parsed = JSON.parse(raw) as Partial<GuestLimitStorage> | Partial<Record<LimitedGameMode, number>>;
    const todayKey = getTodayKey();

    if ("dayKey" in parsed && parsed.dayKey === todayKey) {
      return {
        dayKey: parsed.dayKey,
        counts: parsed.counts ?? {},
      };
    }

    return createEmptyStorage(todayKey);
  } catch {
    return createEmptyStorage();
  }
};

const saveStorage = (value: GuestLimitStorage) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  dispatchStorageUpdate();
};

const buildModeStatus = (played: number): ModeLimitStatus => ({
  played,
  remaining: Math.max(0, DAILY_MODE_ROUND_LIMIT - played),
  reached: played >= DAILY_MODE_ROUND_LIMIT,
});

export const getGuestDailyModeLimits = (): DailyModeLimits => {
  const storage = loadStorage();

  return {
    dayKey: storage.dayKey,
    limit: DAILY_MODE_ROUND_LIMIT,
    modes: {
      classic: buildModeStatus(storage.counts.classic ?? 0),
      hard: buildModeStatus(storage.counts.hard ?? 0),
      timed: buildModeStatus(storage.counts.timed ?? 0),
    },
  };
};

export const consumeGuestDailyRound = (mode: LimitedGameMode): ModeLimitStatus => {
  const storage = loadStorage();
  const currentPlayed = storage.counts[mode] ?? 0;

  if (currentPlayed >= DAILY_MODE_ROUND_LIMIT) {
    throw new Error(`Daily limit reached for ${mode} mode. Come back tomorrow.`);
  }

  const nextStorage: GuestLimitStorage = {
    dayKey: storage.dayKey,
    counts: {
      ...storage.counts,
      [mode]: currentPlayed + 1,
    },
  };

  saveStorage(nextStorage);
  return buildModeStatus(currentPlayed + 1);
};

export const subscribeToGuestDailyModeLimits = (callback: () => void) => {
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

export const isModeLimitedForGuest = (mode: LimitedGameMode, isSignedIn: boolean): boolean => {
  if (isSignedIn) return false;
  return getGuestDailyModeLimits().modes[mode].reached;
};
