import { EquippedCosmetics } from "@/lib/cosmetics";

type GuestTrackedMode = "classic" | "hard" | "timed";

export type GuestQuestSlot = {
  questId: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward: number;
  modeProgress?: GuestTrackedMode[];
};

export type GuestCosmeticsState = {
  shards: number;
  ownedCosmetics: string[];
  equippedCosmetics: EquippedCosmetics;
  questSlots: GuestQuestSlot[];
};

const GUEST_COSMETICS_STORAGE_KEY = "wordclash_guest_cosmetics_v1";
const GUEST_COSMETICS_UPDATED_EVENT = "wordclash:guest-cosmetics-updated";
const GUEST_STARTER_SHARDS = 9;
const TRACKED_MODES: GuestTrackedMode[] = ["classic", "hard", "timed"];

const buildDefaultQuestSlots = (): GuestQuestSlot[] => [
  {
    questId: "play_any_1",
    title: "Play One Game",
    description: "Play 1 game in any mode",
    target: 1,
    progress: 0,
    completed: false,
    claimed: false,
    reward: 3,
  },
  {
    questId: "play_all_modes_1",
    title: "Play All Three Modes",
    description: "Play Classic, Hard, and Timed in any order",
    target: 3,
    progress: 0,
    completed: false,
    claimed: false,
    reward: 3,
    modeProgress: [],
  },
  {
    questId: "auth_1",
    title: "Sign In / Sign Up",
    description: "Create an account or sign in once",
    target: 1,
    progress: 0,
    completed: false,
    claimed: false,
    reward: 3,
  },
];

const buildDefaultState = (): GuestCosmeticsState => ({
  shards: GUEST_STARTER_SHARDS,
  ownedCosmetics: [],
  equippedCosmetics: {},
  questSlots: buildDefaultQuestSlots(),
});

const isTrackedMode = (mode: string): mode is GuestTrackedMode =>
  TRACKED_MODES.includes(mode as GuestTrackedMode);

const dispatchGuestCosmeticsUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GUEST_COSMETICS_UPDATED_EVENT));
};

const sanitizeQuestSlots = (questSlots: GuestQuestSlot[] | undefined) => {
  const existingById = new Map((questSlots ?? []).map((slot) => [slot.questId, slot]));

  return buildDefaultQuestSlots().map((defaultSlot) => {
    const existing = existingById.get(defaultSlot.questId);
    if (!existing) return defaultSlot;

    if (defaultSlot.questId === "play_all_modes_1") {
      const modeProgress = Array.from(
        new Set((existing.modeProgress ?? []).filter(isTrackedMode)),
      );
      const progress = Math.min(modeProgress.length, defaultSlot.target);
      return {
        ...defaultSlot,
        ...existing,
        progress,
        completed: progress >= defaultSlot.target,
        modeProgress,
      };
    }

    const progress = Math.min(existing.progress ?? 0, defaultSlot.target);
    return {
      ...defaultSlot,
      ...existing,
      progress,
      completed: progress >= defaultSlot.target,
    };
  });
};

export const getGuestCosmeticsState = (): GuestCosmeticsState => {
  if (typeof window === "undefined") {
    return buildDefaultState();
  }

  const raw = window.localStorage.getItem(GUEST_COSMETICS_STORAGE_KEY);
  if (!raw) {
    return buildDefaultState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GuestCosmeticsState>;
    return {
      shards: Math.max(0, parsed.shards ?? GUEST_STARTER_SHARDS),
      ownedCosmetics: parsed.ownedCosmetics ?? [],
      equippedCosmetics: parsed.equippedCosmetics ?? {},
      questSlots: sanitizeQuestSlots(parsed.questSlots),
    };
  } catch {
    return buildDefaultState();
  }
};

export const saveGuestCosmeticsState = (state: GuestCosmeticsState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_COSMETICS_STORAGE_KEY, JSON.stringify(state));
  dispatchGuestCosmeticsUpdated();
};

export const subscribeToGuestCosmetics = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => callback();
  window.addEventListener(GUEST_COSMETICS_UPDATED_EVENT, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(GUEST_COSMETICS_UPDATED_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
};

export const purchaseGuestCosmetic = (cosmeticId: string, cost: number) => {
  const state = getGuestCosmeticsState();

  if (state.ownedCosmetics.includes(cosmeticId)) {
    throw new Error("Already owned");
  }

  if (state.shards < cost) {
    throw new Error("Not enough shards");
  }

  const nextState: GuestCosmeticsState = {
    ...state,
    shards: state.shards - cost,
    ownedCosmetics: [...state.ownedCosmetics, cosmeticId],
  };

  saveGuestCosmeticsState(nextState);
  return nextState;
};

export const equipGuestCosmetic = (cosmeticId: string) => {
  const state = getGuestCosmeticsState();

  if (!state.ownedCosmetics.includes(cosmeticId)) {
    throw new Error("Cosmetic not owned");
  }

  const nextState: GuestCosmeticsState = {
    ...state,
    equippedCosmetics: {
      ...state.equippedCosmetics,
      theme: state.equippedCosmetics.theme === cosmeticId ? undefined : cosmeticId,
    },
  };

  if (!nextState.equippedCosmetics.theme) {
    delete nextState.equippedCosmetics.theme;
  }

  saveGuestCosmeticsState(nextState);
  return nextState;
};

export const claimGuestQuestReward = (questId: string) => {
  const state = getGuestCosmeticsState();
  const questSlots = sanitizeQuestSlots(state.questSlots);
  const slot = questSlots.find((entry) => entry.questId === questId);

  if (!slot) {
    throw new Error("Quest not found");
  }
  if (!slot.completed) {
    throw new Error("Quest not completed yet");
  }
  if (slot.claimed) {
    throw new Error("Already claimed");
  }

  const nextState: GuestCosmeticsState = {
    ...state,
    shards: state.shards + slot.reward,
    questSlots: questSlots.map((entry) =>
      entry.questId === questId ? { ...entry, claimed: true } : entry,
    ),
  };

  saveGuestCosmeticsState(nextState);
  return nextState;
};

export const recordGuestQuestProgress = (mode: GuestTrackedMode) => {
  const state = getGuestCosmeticsState();
  const nextQuestSlots = sanitizeQuestSlots(state.questSlots).map((slot) => {
    if (slot.questId === "play_any_1" && !slot.completed) {
      return {
        ...slot,
        progress: 1,
        completed: true,
      };
    }

    if (slot.questId === "play_all_modes_1") {
      const modeProgress = Array.from(
        new Set([...(slot.modeProgress ?? []), mode].filter(isTrackedMode)),
      );
      const progress = Math.min(modeProgress.length, slot.target);
      return {
        ...slot,
        progress,
        completed: progress >= slot.target,
        modeProgress,
      };
    }

    return slot;
  });

  const nextState: GuestCosmeticsState = {
    ...state,
    questSlots: nextQuestSlots,
  };

  saveGuestCosmeticsState(nextState);
  return nextState;
};
