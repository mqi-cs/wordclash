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
}

type TrackedMode = "classic" | "hard" | "timed";

type QuestSlot = {
  questId: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward: number;
  modeProgress?: TrackedMode[];
};

const TRACKED_MODES: TrackedMode[] = ["classic", "hard", "timed"];

const PLAY_ONE_GAME_QUEST: QuestTemplate = {
  id: "play_any_1",
  title: "Play One Game",
  description: "Play 1 game in any mode",
  target: 1,
  reward: 3,
};

const PLAY_ALL_MODES_QUEST: QuestTemplate = {
  id: "play_all_modes_1",
  title: "Play All Three Modes",
  description: "Play Classic, Hard, and Timed in the same day",
  target: 3,
  reward: 3,
};

const AUTH_QUEST: QuestTemplate = {
  id: "auth_1",
  title: "Sign In / Sign Up",
  description: "Create an account or sign in once today",
  target: 1,
  reward: 3,
};

const DEFAULT_DAILY_QUESTS: QuestTemplate[] = [
  PLAY_ONE_GAME_QUEST,
  PLAY_ALL_MODES_QUEST,
  AUTH_QUEST,
];
const CURRENT_QUEST_VERSION = 2;

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
  {
    progress = 0,
    completed = false,
    claimed = false,
    modeProgress,
  }: Partial<QuestSlot> = {},
): QuestSlot => ({
  questId: template.id,
  title: template.title,
  description: template.description,
  target: template.target,
  progress,
  completed,
  claimed,
  reward: template.reward,
  ...(modeProgress && modeProgress.length > 0 ? { modeProgress } : {}),
});

const buildDefaultQuestSlots = (isAuthenticated: boolean): QuestSlot[] =>
  DEFAULT_DAILY_QUESTS.map((template) => {
    if (template.id === AUTH_QUEST.id) {
      return buildQuestSlot(template, {
        progress: isAuthenticated ? 1 : 0,
        completed: isAuthenticated,
      });
    }

    if (template.id === PLAY_ALL_MODES_QUEST.id) {
      return buildQuestSlot(template, { modeProgress: [] });
    }

    return buildQuestSlot(template);
  });

const mergeQuestSlots = (
  existingSlots: readonly QuestSlot[] | undefined,
  isAuthenticated: boolean,
): QuestSlot[] => {
  const existingById = new Map(
    (existingSlots ?? []).map((slot) => [slot.questId, slot]),
  );

  return DEFAULT_DAILY_QUESTS.map((template) => {
    const existing = existingById.get(template.id);

    if (template.id === AUTH_QUEST.id) {
      const completed = isAuthenticated;
      return buildQuestSlot(template, {
        progress: completed ? 1 : 0,
        completed,
        claimed: completed ? existing?.claimed ?? false : false,
      });
    }

    if (template.id === PLAY_ALL_MODES_QUEST.id) {
      const modeProgress = normalizeModeProgress(existing?.modeProgress);
      const progress = Math.min(modeProgress.length, template.target);
      return buildQuestSlot(template, {
        progress,
        completed: progress >= template.target,
        claimed: existing?.claimed ?? false,
        modeProgress,
      });
    }

    const progress = Math.min(existing?.progress ?? 0, template.target);
    return buildQuestSlot(template, {
      progress,
      completed: progress >= template.target || existing?.claimed === true,
      claimed: existing?.claimed ?? false,
    });
  });
};

const areQuestSlotsEqual = (left: readonly QuestSlot[], right: readonly QuestSlot[]) => {
  if (left.length !== right.length) return false;

  return left.every((slot, index) => {
    const other = right[index];
    if (!other) return false;

    const leftModes = normalizeModeProgress(slot.modeProgress);
    const rightModes = normalizeModeProgress(other.modeProgress);

    return (
      slot.questId === other.questId &&
      slot.title === other.title &&
      slot.description === other.description &&
      slot.target === other.target &&
      slot.progress === other.progress &&
      slot.completed === other.completed &&
      slot.claimed === other.claimed &&
      slot.reward === other.reward &&
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
  const existing = await ctx.db
    .query("quests")
    .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
    .unique();

  if (existing) {
    const shouldResetToCurrentQuestSet =
      existing.questVersion !== CURRENT_QUEST_VERSION;
    const nextSlots = shouldResetToCurrentQuestSet
      ? buildDefaultQuestSlots(true)
      : mergeQuestSlots(existing.questSlots, true);

    if (
      shouldResetToCurrentQuestSet ||
      !areQuestSlotsEqual(existing.questSlots, nextSlots)
    ) {
      await ctx.db.patch(existing._id, {
        questVersion: CURRENT_QUEST_VERSION,
        questSlots: nextSlots,
      });
    }

    return { questId: existing._id, questSlots: nextSlots };
  }

  const latestQuestDoc = await getLatestQuestDocForUser(ctx, userId);
  const shouldResetToCurrentQuestSet =
    !latestQuestDoc || latestQuestDoc.questVersion !== CURRENT_QUEST_VERSION;
  const nextSlots = shouldResetToCurrentQuestSet
    ? buildDefaultQuestSlots(true)
    : mergeQuestSlots(latestQuestDoc.questSlots, true);

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
) =>
  questSlots.map((slot) => {
    if (slot.claimed) return slot;

    if (slot.questId === PLAY_ONE_GAME_QUEST.id) {
      const progress = Math.min(slot.progress + 1, slot.target);
      return {
        ...slot,
        progress,
        completed: progress >= slot.target,
      };
    }

    if (slot.questId === PLAY_ALL_MODES_QUEST.id) {
      if (!isTrackedMode(args.mode)) {
        return slot;
      }

      const modeProgress = normalizeModeProgress(slot.modeProgress);
      if (modeProgress.includes(args.mode)) {
        return slot;
      }

      const nextModeProgress = [...modeProgress, args.mode];
      const progress = Math.min(nextModeProgress.length, slot.target);
      return {
        ...slot,
        progress,
        completed: progress >= slot.target,
        modeProgress: nextModeProgress,
      };
    }

    return slot;
  });

// ── Queries ──────────────────────────────────────────────────────────

/** Get today's quests for the current user (auto-generates if missing) */
export const getMyQuests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return {
        dayKey: getTodayKey(),
        preview: true,
        questSlots: buildDefaultQuestSlots(false),
      };
    }

    const dayKey = getTodayKey();
    const existing = await ctx.db
      .query("quests")
      .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
      .unique();

    if (existing) {
      const questSlots = existing.questVersion === CURRENT_QUEST_VERSION
        ? mergeQuestSlots(existing.questSlots, true)
        : buildDefaultQuestSlots(true);

      return {
        ...existing,
        questVersion: CURRENT_QUEST_VERSION,
        questSlots,
      };
    }

    const latestQuestDoc = await getLatestQuestDocForUser(ctx, userId);
    const questSlots =
      latestQuestDoc && latestQuestDoc.questVersion === CURRENT_QUEST_VERSION
        ? mergeQuestSlots(latestQuestDoc.questSlots, true)
        : buildDefaultQuestSlots(true);

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
    const updated = applyQuestProgressUpdate(questSlots, args);
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
    const updated = applyQuestProgressUpdate(questSlots, args);
    await ctx.db.patch(questId, { questSlots: updated });
  },
});

/** Claim a completed quest's shard reward */
export const claimQuestReward = mutation({
  args: { questId: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const { questId, questSlots } = await ensureTodayQuestDoc(ctx, userId);

    const slot = questSlots.find((s) => s.questId === args.questId);
    if (!slot) throw new Error("Quest not found");
    if (!slot.completed) throw new Error("Quest not completed yet");
    if (slot.claimed) throw new Error("Already claimed");

    // Mark as claimed
    const updatedSlots = questSlots.map((s) =>
      s.questId === args.questId ? { ...s, claimed: true } : s
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
        quest_id: args.questId,
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
