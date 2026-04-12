import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";

// ── Quest Template Pool ──────────────────────────────────────────────

interface QuestTemplate {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: number; // shards
  kind: "play_any" | "play_mode" | "play_all_modes" | "auth" | "win_any" | "green_letters";
  requiredMode?: TrackedMode;
}

type TrackedMode = "classic" | "hard" | "timed";

type QuestSlot = {
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
  modeProgress?: TrackedMode[];
};

const TRACKED_MODES: TrackedMode[] = ["classic", "hard", "timed"];
const QUEST_REFRESH_MS = 24 * 60 * 60 * 1000;

const PLAY_ONE_GAME_QUEST: QuestTemplate = {
  id: "play_any_1",
  title: "Play One Game",
  description: "Play 1 game in any mode",
  target: 1,
  reward: 3,
  kind: "play_any",
};

const PLAY_ALL_MODES_QUEST: QuestTemplate = {
  id: "play_all_modes_1",
  title: "Play All Three Modes",
  description: "Play Classic, Hard, and Timed in the same day",
  target: 3,
  reward: 3,
  kind: "play_all_modes",
};

const AUTH_QUEST: QuestTemplate = {
  id: "auth_1",
  title: "Sign In / Sign Up",
  description: "Create an account or sign in once today",
  target: 1,
  reward: 3,
  kind: "auth",
};

const PLAY_CLASSIC_QUEST: QuestTemplate = {
  id: "play_classic_1",
  title: "Classic Run",
  description: "Play 1 Classic game",
  target: 1,
  reward: 3,
  kind: "play_mode",
  requiredMode: "classic",
};

const PLAY_HARD_QUEST: QuestTemplate = {
  id: "play_hard_1",
  title: "Hard Run",
  description: "Play 1 Hard game",
  target: 1,
  reward: 3,
  kind: "play_mode",
  requiredMode: "hard",
};

const PLAY_TIMED_QUEST: QuestTemplate = {
  id: "play_timed_1",
  title: "Timed Run",
  description: "Play 1 Timed game",
  target: 1,
  reward: 3,
  kind: "play_mode",
  requiredMode: "timed",
};

const WIN_ANY_GAME_QUEST: QuestTemplate = {
  id: "win_any_1",
  title: "Win One Game",
  description: "Win 1 game in any mode",
  target: 1,
  reward: 4,
  kind: "win_any",
};

const PLAY_THREE_GAMES_QUEST: QuestTemplate = {
  id: "play_any_3",
  title: "Three-Round Warmup",
  description: "Play 3 games in any mode",
  target: 3,
  reward: 4,
  kind: "play_any",
};

const GREEN_LETTERS_QUEST: QuestTemplate = {
  id: "green_letters_10",
  title: "Green Letter Chase",
  description: "Find 10 green letters",
  target: 10,
  reward: 4,
  kind: "green_letters",
};

const DEFAULT_DAILY_QUESTS: QuestTemplate[] = [
  PLAY_ONE_GAME_QUEST,
  PLAY_ALL_MODES_QUEST,
  AUTH_QUEST,
];
const REPEATABLE_QUESTS: QuestTemplate[] = [
  PLAY_CLASSIC_QUEST,
  PLAY_HARD_QUEST,
  PLAY_TIMED_QUEST,
  WIN_ANY_GAME_QUEST,
  PLAY_THREE_GAMES_QUEST,
  GREEN_LETTERS_QUEST,
];
const QUESTS_BY_ID = new Map(
  [...DEFAULT_DAILY_QUESTS, ...REPEATABLE_QUESTS].map((template) => [template.id, template]),
);
const REPEATABLE_SLOT_POOLS: readonly (readonly string[])[] = [
  [PLAY_CLASSIC_QUEST.id, WIN_ANY_GAME_QUEST.id, GREEN_LETTERS_QUEST.id, PLAY_THREE_GAMES_QUEST.id, PLAY_TIMED_QUEST.id],
  [PLAY_HARD_QUEST.id, GREEN_LETTERS_QUEST.id, PLAY_THREE_GAMES_QUEST.id, WIN_ANY_GAME_QUEST.id, PLAY_CLASSIC_QUEST.id],
  [PLAY_TIMED_QUEST.id, WIN_ANY_GAME_QUEST.id, GREEN_LETTERS_QUEST.id, PLAY_HARD_QUEST.id, PLAY_THREE_GAMES_QUEST.id],
];
const CURRENT_QUEST_VERSION = 3;

// ── Cosmetic Catalog ─────────────────────────────────────────────────

export interface CosmeticItem {
  id: string;
  category: "theme";
  name: string;
  description: string;
  cost: number; // shards
}

export const COSMETIC_CATALOG: CosmeticItem[] = [
  { id: "theme_cyberpunk", category: "theme", name: "Neon Cyberpunk", description: "Vibrant glowing grid, glitch letters, data decrypt animation, and circuitry background", cost: 9 },
  { id: "theme_library", category: "theme", name: "Ancient Library", description: "Wood/brass grid, hand-stamped letters, ink soak animation, and dark parchment landscape", cost: 9 },
  { id: "theme_minimalist", category: "theme", name: "Garden Minimalist", description: "Glass tile grid, soft pebble letters, solar flare animation, and an aurora background", cost: 9 },
  { id: "theme_cosmic_voyager", category: "theme", name: "Cosmic Voyager", description: "Obsidian-titanium grid, constellation letters, warp-light reveal, and a swirling galaxy backdrop", cost: 9 },
  { id: "theme_arcade_8bit", category: "theme", name: "8-Bit Retro Arcade", description: "CRT pixel grid, chunky sprite letters, pixel-shatter reveal, and a high-score cabinet backdrop", cost: 9 },
  { id: "theme_cathedral", category: "theme", name: "Stained Glass Cathedral", description: "Lead came grid, gothic serif letters, light ray bloom reveals, and a dim stone cloister backdrop", cost: 9 },
  { id: "theme_origami_zen", category: "theme", name: "Origami Zen", description: "Washi paper grid, Sumi-e letters, paper fold reveals, and a cherry blossom zen garden", cost: 9 },
  { id: "theme_shadow_puppet", category: "theme", name: "Shadow Puppet Theater", description: "Paper-cut screen, cardstock silhouette letters, and lantern shift reveal on a silk screen", cost: 9 },
  { id: "theme_tapestry", category: "theme", name: "The Embroidered Tapestry", description: "Cross-stitch canvas grid, embroidered yarn letters, needle-work reveal, and a sewing basket backdrop", cost: 9 },
];

const VALID_COSMETIC_IDS = new Set(COSMETIC_CATALOG.map((item) => item.id));

// ── Helpers ──────────────────────────────────────────────────────────

function getTodayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const isTrackedMode = (value: string): value is TrackedMode =>
  TRACKED_MODES.includes(value as TrackedMode);

const normalizeModeProgress = (modes: readonly string[] | undefined): TrackedMode[] => {
  if (!modes) return [];

  return Array.from(new Set(modes.filter(isTrackedMode)));
};

const buildQuestSlot = (
  template: QuestTemplate,
  slotIndex: number,
  {
    slotId,
    progress = 0,
    completed = false,
    claimed = false,
    completedAt,
    refreshAfter,
    rotationCount = 0,
    modeProgress,
  }: Partial<QuestSlot> = {},
): QuestSlot => ({
  slotId: slotId ?? `slot-${slotIndex}-${rotationCount}`,
  questId: template.id,
  title: template.title,
  description: template.description,
  target: template.target,
  progress,
  completed,
  claimed,
  reward: template.reward,
  ...(typeof completedAt === "number" ? { completedAt } : {}),
  ...(typeof refreshAfter === "number" ? { refreshAfter } : {}),
  ...(rotationCount > 0 ? { rotationCount } : {}),
  ...(modeProgress && modeProgress.length > 0 ? { modeProgress } : {}),
});

const buildDefaultQuestSlots = (isAuthenticated: boolean): QuestSlot[] =>
  DEFAULT_DAILY_QUESTS.map((template, slotIndex) => {
    if (template.id === AUTH_QUEST.id) {
      const completedAt = isAuthenticated ? Date.now() : undefined;
      return buildQuestSlot(template, slotIndex, {
        progress: isAuthenticated ? 1 : 0,
        completed: isAuthenticated,
        ...(typeof completedAt === "number"
          ? {
              completedAt,
              refreshAfter: completedAt + QUEST_REFRESH_MS,
            }
          : {}),
      });
    }

    if (template.id === PLAY_ALL_MODES_QUEST.id) {
      return buildQuestSlot(template, slotIndex, { modeProgress: [] });
    }

    return buildQuestSlot(template, slotIndex);
  });

const getReplacementQuestTemplate = (slotIndex: number, rotationCount: number): QuestTemplate => {
  const pool = REPEATABLE_SLOT_POOLS[slotIndex % REPEATABLE_SLOT_POOLS.length];
  const questId = pool[(Math.max(rotationCount, 1) - 1) % pool.length];
  return QUESTS_BY_ID.get(questId) ?? PLAY_THREE_GAMES_QUEST;
};

const normalizeQuestSlot = (
  slotIndex: number,
  existing: QuestSlot | undefined,
  isAuthenticated: boolean,
  now: number,
): QuestSlot => {
  const rotationCount = Math.max(existing?.rotationCount ?? 0, 0);
  const fallbackTemplate =
    rotationCount > 0
      ? getReplacementQuestTemplate(slotIndex, rotationCount)
      : DEFAULT_DAILY_QUESTS[slotIndex] ?? getReplacementQuestTemplate(slotIndex, 1);
  const template = QUESTS_BY_ID.get(existing?.questId ?? "") ?? fallbackTemplate;

  const modeProgress =
    template.kind === "play_all_modes"
      ? normalizeModeProgress(existing?.modeProgress)
      : undefined;
  const progress =
    template.kind === "auth"
      ? isAuthenticated
        ? template.target
        : 0
      : template.kind === "play_all_modes"
        ? Math.min(modeProgress?.length ?? 0, template.target)
        : Math.min(Math.max(existing?.progress ?? 0, 0), template.target);
  const completed =
    template.kind === "auth"
      ? isAuthenticated
      : progress >= template.target || existing?.claimed === true;

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

const normalizeQuestSlots = (
  existingSlots: readonly QuestSlot[] | undefined,
  isAuthenticated: boolean,
  now: number,
): QuestSlot[] =>
  Array.from({ length: DEFAULT_DAILY_QUESTS.length }, (_, slotIndex) =>
    normalizeQuestSlot(slotIndex, existingSlots?.[slotIndex], isAuthenticated, now),
  );

const areQuestSlotsEqual = (left: readonly QuestSlot[], right: readonly QuestSlot[]) => {
  if (left.length !== right.length) return false;

  return left.every((slot, index) => {
    const other = right[index];
    if (!other) return false;

    const leftModes = normalizeModeProgress(slot.modeProgress);
    const rightModes = normalizeModeProgress(other.modeProgress);

    return (
      slot.slotId === other.slotId &&
      slot.questId === other.questId &&
      slot.title === other.title &&
      slot.description === other.description &&
      slot.target === other.target &&
      slot.progress === other.progress &&
      slot.completed === other.completed &&
      slot.claimed === other.claimed &&
      slot.reward === other.reward &&
      slot.completedAt === other.completedAt &&
      slot.refreshAfter === other.refreshAfter &&
      slot.rotationCount === other.rotationCount &&
      leftModes.length === rightModes.length &&
      leftModes.every((mode, modeIndex) => mode === rightModes[modeIndex])
    );
  });
};

const getLatestQuestDocForUser = async (
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"quests"> | null> => {
  const questDocs = await ctx.db
    .query("quests")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(30);

  if (questDocs.length === 0) {
    return null;
  }

  return questDocs.sort((a, b) => b._creationTime - a._creationTime)[0] ?? null;
};

const ensureTodayQuestDoc = async (
  ctx: MutationCtx,
  userId: Id<"users">,
) => {
  const dayKey = getTodayKey();
  const now = Date.now();
  const existing = await ctx.db
    .query("quests")
    .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
    .unique();

  if (existing) {
    const nextSlots = normalizeQuestSlots(existing.questSlots, true, now);

    if (existing.questVersion !== CURRENT_QUEST_VERSION || !areQuestSlotsEqual(existing.questSlots, nextSlots)) {
      await ctx.db.patch(existing._id, {
        questVersion: CURRENT_QUEST_VERSION,
        questSlots: nextSlots,
      });
    }

    return { questId: existing._id, questSlots: nextSlots };
  }

  const latestQuestDoc = await getLatestQuestDocForUser(ctx, userId);
  const nextSlots = normalizeQuestSlots(latestQuestDoc?.questSlots, true, now);

  const questId = await ctx.db.insert("quests", {
    userId,
    dayKey,
    questVersion: CURRENT_QUEST_VERSION,
    questSlots: nextSlots,
  });

  return { questId, questSlots: nextSlots };
};

const applyQuestProgressUpdate = (
  questSlots: readonly QuestSlot[],
  args: {
    mode: "classic" | "hard" | "timed" | "multiplayer";
    won: boolean;
    greenLetters: number;
  },
  now: number,
) =>
  questSlots.map((slot, slotIndex) => {
    if (slot.claimed) return slot;
    if (slot.completed) return slot;

    const template =
      QUESTS_BY_ID.get(slot.questId) ?? getReplacementQuestTemplate(slotIndex, slot.rotationCount ?? 1);
    const completeSlot = (next: Partial<QuestSlot>): QuestSlot => {
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
        if (args.mode !== template.requiredMode) {
          return slot;
        }
        return completeSlot({ progress: slot.progress + 1 });
      case "play_all_modes": {
        if (!isTrackedMode(args.mode)) {
          return slot;
        }

        const modeProgress = normalizeModeProgress(slot.modeProgress);
        if (modeProgress.includes(args.mode)) {
          return slot;
        }

        const nextModeProgress = [...modeProgress, args.mode];
        return completeSlot({
          progress: nextModeProgress.length,
          modeProgress: nextModeProgress,
        });
      }
      case "win_any":
        if (!args.won) {
          return slot;
        }
        return completeSlot({ progress: slot.progress + 1 });
      case "green_letters":
        return completeSlot({ progress: slot.progress + args.greenLetters });
      case "auth":
        return slot;
    }
  });

// ── Queries ──────────────────────────────────────────────────────────

/** Get today's quests for the current user (auto-generates if missing) */
export const getMyQuests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    const now = Date.now();
    if (!userId) {
      return {
        dayKey: getTodayKey(),
        preview: true,
        questSlots: normalizeQuestSlots(undefined, false, now),
      };
    }

    const dayKey = getTodayKey();
    const existing = await ctx.db
      .query("quests")
      .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
      .unique();

    if (existing) {
      const questSlots = normalizeQuestSlots(existing.questSlots, true, now);

      return {
        ...existing,
        questVersion: CURRENT_QUEST_VERSION,
        questSlots,
      };
    }

    const latestQuestDoc = await getLatestQuestDocForUser(ctx, userId);
    const questSlots = normalizeQuestSlots(latestQuestDoc?.questSlots, true, now);

    return {
      _id: null as unknown,
      userId,
      dayKey,
      questVersion: CURRENT_QUEST_VERSION,
      questSlots,
    };
  },
});

/** Get current shard balance + owned cosmetics */
export const getMyCosmetics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return { shards: 0, ownedCosmetics: [], equippedCosmetics: {} };
    }

    const wallet = await ctx.db
      .query("userCosmetics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!wallet) {
      return { shards: 0, ownedCosmetics: [], equippedCosmetics: {} };
    }

    const equippedCosmetics = Object.fromEntries(
      Object.entries(wallet.equippedCosmetics).filter(([, cosmeticId]) => VALID_COSMETIC_IDS.has(cosmeticId)),
    );

    return {
      shards: wallet.shards,
      ownedCosmetics: wallet.ownedCosmetics,
      equippedCosmetics,
    };
  },
});

/** Return the static catalog so the frontend doesn't duplicate it */
export const getCatalog = query({
  args: {},
  handler: async () => {
    return COSMETIC_CATALOG;
  },
});

// ── Mutations ────────────────────────────────────────────────────────

/** Ensure today's quests exist (called once per session from frontend) */
export const seedDailyQuests = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const { questId } = await ensureTodayQuestDoc(ctx, userId);
    return questId;
  },
});

/** Increment quest progress after a game finishes.
 *  Called from stats.updateStats or separately. */
export const recordQuestProgress = mutation({
  args: {
    mode: v.union(v.literal("classic"), v.literal("hard"), v.literal("timed"), v.literal("multiplayer")),
    won: v.boolean(),
    greenLetters: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return;

    const { questId, questSlots } = await ensureTodayQuestDoc(ctx, userId);
    const updated = applyQuestProgressUpdate(questSlots, args, Date.now());
    await ctx.db.patch(questId, { questSlots: updated });
  },
});

/** Internal version called from stats.updateStats (already has userId) */
export const internalRecordQuestProgress = internalMutation({
  args: {
    userId: v.id("users"),
    mode: v.union(v.literal("classic"), v.literal("hard"), v.literal("timed"), v.literal("multiplayer")),
    won: v.boolean(),
    greenLetters: v.number(),
  },
  handler: async (ctx, args) => {
    const { questId, questSlots } = await ensureTodayQuestDoc(ctx, args.userId);
    const updated = applyQuestProgressUpdate(questSlots, args, Date.now());
    await ctx.db.patch(questId, { questSlots: updated });
  },
});

/** Claim a completed quest's shard reward */
export const claimQuestReward = mutation({
  args: { slotId: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const { questId, questSlots } = await ensureTodayQuestDoc(ctx, userId);

    const slot = questSlots.find((s) => s.slotId === args.slotId);
    if (!slot) throw new Error("Quest not found");
    if (!slot.completed) throw new Error("Quest not completed yet");
    if (slot.claimed) throw new Error("Already claimed");

    // Mark as claimed
    const updatedSlots = questSlots.map((s) =>
      s.slotId === args.slotId ? { ...s, claimed: true } : s
    );
    await ctx.db.patch(questId, { questSlots: updatedSlots });

    // Credit shards
    const wallet = await ctx.db
      .query("userCosmetics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (wallet) {
      await ctx.db.patch(wallet._id, { shards: wallet.shards + slot.reward });
    } else {
      await ctx.db.insert("userCosmetics", {
        userId,
        shards: slot.reward,
        ownedCosmetics: [],
        equippedCosmetics: {},
      });
    }

    ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "quest reward claimed",
      properties: {
        quest_id: slot.questId,
        quest_slot_id: args.slotId,
        shards_earned: slot.reward,
      },
      personProperties: {
        shards_total: wallet ? wallet.shards + slot.reward : slot.reward,
      },
    });
  },
});

/** Purchase a cosmetic with shards */
export const purchaseCosmetic = mutation({
  args: { cosmeticId: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const item = COSMETIC_CATALOG.find((c) => c.id === args.cosmeticId);
    if (!item) throw new Error("Cosmetic not found");

    const wallet = await ctx.db
      .query("userCosmetics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const currentShards = wallet?.shards ?? 0;
    if (currentShards < item.cost) throw new Error("Not enough shards");

    const owned = wallet?.ownedCosmetics ?? [];
    if (owned.includes(item.id)) throw new Error("Already owned");

    const newShards = (wallet?.shards ?? 0) - item.cost;
    const newOwned = [...owned, item.id];

    if (wallet) {
      await ctx.db.patch(wallet._id, {
        shards: newShards,
        ownedCosmetics: newOwned,
      });
    } else {
      await ctx.db.insert("userCosmetics", {
        userId,
        shards: -item.cost, // shouldn't happen
        ownedCosmetics: [item.id],
        equippedCosmetics: {},
      });
    }

    ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "cosmetic purchased",
      properties: {
        cosmetic_id: item.id,
        cosmetic_name: item.name,
        cosmetic_category: item.category,
        shards_spent: item.cost,
      },
      personProperties: {
        shards_total: newShards,
        themes_owned_count: newOwned.length,
      },
    });
  },
});

/** Equip an owned cosmetic */
export const equipCosmetic = mutation({
  args: {
    cosmeticId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const item = COSMETIC_CATALOG.find((c) => c.id === args.cosmeticId);
    if (!item) throw new Error("Cosmetic not found");

    const wallet = await ctx.db
      .query("userCosmetics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!wallet || !wallet.ownedCosmetics.includes(item.id)) {
      throw new Error("Cosmetic not owned");
    }

    const equipped: Record<string, string> = { ...wallet.equippedCosmetics };
    const slotKey = "theme";

    if (equipped[slotKey] === item.id) {
      delete equipped[slotKey];
    } else {
      equipped[slotKey] = item.id;
    }

    await ctx.db.patch(wallet._id, { equippedCosmetics: equipped });

    const isNowEquipped = equipped[slotKey] === item.id;
    ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "cosmetic equipped",
      properties: {
        cosmetic_id: item.id,
        cosmetic_name: item.name,
        cosmetic_category: item.category,
        equipped: isNowEquipped,
      },
      personProperties: {
        equipped_theme: isNowEquipped ? item.name : "Default",
      },
    });
  },
});
