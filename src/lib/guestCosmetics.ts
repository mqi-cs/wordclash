import { EquippedCosmetics } from "@/lib/cosmetics";

type GuestTrackedMode = "classic" | "hard" | "timed";

export type GuestQuestSlot = {
  slotId?: string;
  questId: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward: number;
  completedAt?: number;
  refreshAfter?: number;
  rotationCount?: number;
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
const QUEST_REFRESH_MS = 24 * 60 * 60 * 1000;

type GuestQuestTemplate = {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: number;
  kind: "play_any" | "play_mode" | "play_all_modes" | "auth" | "win_any" | "green_letters";
  requiredMode?: GuestTrackedMode;
};

const STARTER_QUESTS: GuestQuestTemplate[] = [
  {
    id: "play_any_1",
    title: "Play One Game",
    description: "Play 1 game in any mode",
    target: 1,
    reward: 3,
    kind: "play_any",
  },
  {
    id: "play_all_modes_1",
    title: "Play All Three Modes",
    description: "Play Classic, Hard, and Timed in the same day",
    target: 3,
    reward: 3,
    kind: "play_all_modes",
  },
  {
    id: "auth_1",
    title: "Sign In / Sign Up",
    description: "Create an account or sign in once today",
    target: 1,
    reward: 3,
    kind: "auth",
  },
];

const REPEATABLE_QUESTS: GuestQuestTemplate[] = [
  {
    id: "play_classic_1",
    title: "Classic Run",
    description: "Play 1 Classic game",
    target: 1,
    reward: 3,
    kind: "play_mode",
    requiredMode: "classic",
  },
  {
    id: "play_hard_1",
    title: "Hard Run",
    description: "Play 1 Hard game",
    target: 1,
    reward: 3,
    kind: "play_mode",
    requiredMode: "hard",
  },
  {
    id: "play_timed_1",
    title: "Timed Run",
    description: "Play 1 Timed game",
    target: 1,
    reward: 3,
    kind: "play_mode",
    requiredMode: "timed",
  },
  {
    id: "win_any_1",
    title: "Win One Game",
    description: "Win 1 game in any mode",
    target: 1,
    reward: 4,
    kind: "win_any",
  },
  {
    id: "play_any_3",
    title: "Three-Round Warmup",
    description: "Play 3 games in any mode",
    target: 3,
    reward: 4,
    kind: "play_any",
  },
  {
    id: "green_letters_10",
    title: "Green Letter Chase",
    description: "Find 10 green letters",
    target: 10,
    reward: 4,
    kind: "green_letters",
  },
];

const QUESTS_BY_ID = new Map(
  [...STARTER_QUESTS, ...REPEATABLE_QUESTS].map((template) => [template.id, template]),
);
const REPEATABLE_SLOT_POOLS: readonly (readonly string[])[] = [
  ["play_classic_1", "win_any_1", "green_letters_10", "play_any_3", "play_timed_1"],
  ["play_hard_1", "green_letters_10", "play_any_3", "win_any_1", "play_classic_1"],
  ["play_timed_1", "win_any_1", "green_letters_10", "play_hard_1", "play_any_3"],
];

const buildQuestSlot = (
  template: GuestQuestTemplate,
  slotIndex: number,
  partial: Partial<GuestQuestSlot> = {},
): GuestQuestSlot => ({
  slotId: partial.slotId ?? `slot-${slotIndex}-${partial.rotationCount ?? 0}`,
  questId: template.id,
  title: template.title,
  description: template.description,
  target: template.target,
  progress: partial.progress ?? 0,
  completed: partial.completed ?? false,
  claimed: partial.claimed ?? false,
  reward: template.reward,
  ...(typeof partial.completedAt === "number" ? { completedAt: partial.completedAt } : {}),
  ...(typeof partial.refreshAfter === "number" ? { refreshAfter: partial.refreshAfter } : {}),
  ...(typeof partial.rotationCount === "number" && partial.rotationCount > 0
    ? { rotationCount: partial.rotationCount }
    : {}),
  ...(partial.modeProgress && partial.modeProgress.length > 0
    ? { modeProgress: partial.modeProgress }
    : {}),
});

const buildDefaultQuestSlots = (): GuestQuestSlot[] =>
  STARTER_QUESTS.map((template, slotIndex) =>
    template.kind === "play_all_modes"
      ? buildQuestSlot(template, slotIndex, { modeProgress: [] })
      : buildQuestSlot(template, slotIndex),
  );

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

const getReplacementQuestTemplate = (slotIndex: number, rotationCount: number) => {
  const pool = REPEATABLE_SLOT_POOLS[slotIndex % REPEATABLE_SLOT_POOLS.length];
  const questId = pool[(Math.max(rotationCount, 1) - 1) % pool.length];
  return QUESTS_BY_ID.get(questId) ?? REPEATABLE_QUESTS[0];
};

const normalizeQuestSlot = (
  slotIndex: number,
  existing: GuestQuestSlot | undefined,
  now: number,
): GuestQuestSlot => {
  const rotationCount = Math.max(existing?.rotationCount ?? 0, 0);
  const fallbackTemplate =
    rotationCount > 0
      ? getReplacementQuestTemplate(slotIndex, rotationCount)
      : STARTER_QUESTS[slotIndex] ?? getReplacementQuestTemplate(slotIndex, 1);
  const template = QUESTS_BY_ID.get(existing?.questId ?? "") ?? fallbackTemplate;
  const modeProgress =
    template.kind === "play_all_modes"
      ? Array.from(new Set((existing?.modeProgress ?? []).filter(isTrackedMode)))
      : undefined;
  const progress =
    template.kind === "play_all_modes"
      ? Math.min(modeProgress?.length ?? 0, template.target)
      : Math.min(Math.max(existing?.progress ?? 0, 0), template.target);
  const completed = progress >= template.target || existing?.claimed === true;
  const normalized = buildQuestSlot(template, slotIndex, {
    slotId: existing?.slotId,
    progress,
    completed,
    claimed: existing?.claimed ?? false,
    rotationCount,
    ...(modeProgress ? { modeProgress } : {}),
    ...(completed
      ? {
          completedAt: existing?.completedAt ?? now,
          refreshAfter: existing?.refreshAfter ?? (existing?.completedAt ?? now) + QUEST_REFRESH_MS,
        }
      : {}),
  });

  if (
    normalized.completed &&
    typeof normalized.refreshAfter === "number" &&
    now >= normalized.refreshAfter
  ) {
    const nextRotationCount = rotationCount + 1;
    return buildQuestSlot(getReplacementQuestTemplate(slotIndex, nextRotationCount), slotIndex, {
      rotationCount: nextRotationCount,
    });
  }

  return normalized;
};

const sanitizeQuestSlots = (questSlots: GuestQuestSlot[] | undefined) => {
  const now = Date.now();
  return Array.from({ length: STARTER_QUESTS.length }, (_, slotIndex) =>
    normalizeQuestSlot(slotIndex, questSlots?.[slotIndex], now),
  );
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

export const claimGuestQuestReward = (slotId: string) => {
  const state = getGuestCosmeticsState();
  const questSlots = sanitizeQuestSlots(state.questSlots);
  const slot = questSlots.find((entry) => entry.slotId === slotId);

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
      entry.slotId === slotId ? { ...entry, claimed: true } : entry,
    ),
  };

  saveGuestCosmeticsState(nextState);
  return nextState;
};

export const recordGuestQuestProgress = (
  mode: GuestTrackedMode,
  outcome: { won?: boolean; greenLetters?: number } = {},
) => {
  const state = getGuestCosmeticsState();
  const now = Date.now();
  const nextQuestSlots = sanitizeQuestSlots(state.questSlots).map((slot, slotIndex) => {
    if (slot.claimed || slot.completed) {
      return slot;
    }

    const template =
      QUESTS_BY_ID.get(slot.questId) ?? getReplacementQuestTemplate(slotIndex, slot.rotationCount ?? 1);
    const completeSlot = (next: Partial<GuestQuestSlot>): GuestQuestSlot => {
      const progress = Math.min(next.progress ?? slot.progress, slot.target);
      const completed = progress >= slot.target;
      return {
        ...slot,
        ...next,
        progress,
        completed,
        ...(completed
          ? {
              completedAt: now,
              refreshAfter: now + QUEST_REFRESH_MS,
            }
          : {}),
      };
    };

    switch (template.kind) {
      case "play_any":
        return completeSlot({ progress: slot.progress + 1 });
      case "play_mode":
        if (mode !== template.requiredMode) {
          return slot;
        }
        return completeSlot({ progress: slot.progress + 1 });
      case "play_all_modes": {
        const modeProgress = Array.from(
          new Set([...(slot.modeProgress ?? []), mode].filter(isTrackedMode)),
        );
        return completeSlot({
          progress: modeProgress.length,
          modeProgress,
        });
      }
      case "win_any":
        if (!outcome.won) {
          return slot;
        }
        return completeSlot({ progress: slot.progress + 1 });
      case "green_letters":
        return completeSlot({ progress: slot.progress + (outcome.greenLetters ?? 0) });
      case "auth":
        return slot;
    }
  });

  const nextState: GuestCosmeticsState = {
    ...state,
    questSlots: nextQuestSlots,
  };

  saveGuestCosmeticsState(nextState);
  return nextState;
};
