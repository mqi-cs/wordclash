import { query, mutation, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
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

const QUEST_TEMPLATES: QuestTemplate[] = [
  { id: "play_classic_1", title: "Classic Fan", description: "Play 1 Classic game", target: 1, reward: 3 },
  { id: "play_classic_3", title: "Classic Streak", description: "Play 3 Classic games", target: 3, reward: 3 },
  { id: "play_hard_1", title: "Brave Soul", description: "Play 1 Hard mode game", target: 1, reward: 3 },
  { id: "play_timed_1", title: "Speed Demon", description: "Play 1 Timed game", target: 1, reward: 3 },
  { id: "win_any_1", title: "Victory!", description: "Win any game", target: 1, reward: 3 },
  { id: "win_any_2", title: "Double Win", description: "Win 2 games", target: 2, reward: 3 },
  { id: "play_any_2", title: "Keep Playing", description: "Play 2 games (any mode)", target: 2, reward: 3 },
  { id: "play_any_3", title: "Grinder", description: "Play 3 games (any mode)", target: 3, reward: 3 },
  { id: "green_letters_5", title: "Going Green", description: "Earn 5 green letters total", target: 5, reward: 3 },
  { id: "green_letters_10", title: "Letter Master", description: "Earn 10 green letters total", target: 10, reward: 3 },
];

// ── Cosmetic Catalog ─────────────────────────────────────────────────

export interface CosmeticItem {
  id: string;
  category: "theme";
  name: string;
  description: string;
  cost: number; // shards
}

export const COSMETIC_CATALOG: CosmeticItem[] = [
  { id: "theme_cyberpunk", category: "theme", name: "Neon Cyberpunk", description: "Vibrant glowing grid, glitch letters, data decrypt animation, and circuitry background", cost: 0 },
  { id: "theme_library", category: "theme", name: "Ancient Library", description: "Wood/brass grid, hand-stamped letters, ink soak animation, and dark parchment landscape", cost: 0 },
  { id: "theme_minimalist", category: "theme", name: "Garden Minimalist", description: "Glass tile grid, soft pebble letters, solar flare animation, and an aurora background", cost: 0 },
  { id: "theme_cosmic_voyager", category: "theme", name: "Cosmic Voyager", description: "Obsidian-titanium grid, constellation letters, warp-light reveal, and a swirling galaxy backdrop", cost: 0 },
  { id: "theme_arcade_8bit", category: "theme", name: "8-Bit Retro Arcade", description: "CRT pixel grid, chunky sprite letters, pixel-shatter reveal, and a high-score cabinet backdrop", cost: 0 },
  { id: "theme_cathedral", category: "theme", name: "Stained Glass Cathedral", description: "Lead came grid, gothic serif letters, light ray bloom reveals, and a dim stone cloister backdrop", cost: 0 },
  { id: "theme_origami_zen", category: "theme", name: "Origami Zen", description: "Washi paper grid, Sumi-e letters, paper fold reveals, and a cherry blossom zen garden", cost: 0 },
  { id: "theme_shadow_puppet", category: "theme", name: "Shadow Puppet Theater", description: "Paper-cut screen, cardstock silhouette letters, and lantern shift reveal on a silk screen", cost: 0 },
  { id: "theme_tapestry", category: "theme", name: "The Embroidered Tapestry", description: "Cross-stitch canvas grid, embroidered yarn letters, needle-work reveal, and a sewing basket backdrop", cost: 0 },
];

const VALID_COSMETIC_IDS = new Set(COSMETIC_CATALOG.map((item) => item.id));

// ── Helpers ──────────────────────────────────────────────────────────

function getTodayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Deterministic daily quest selection seeded by dayKey + userId */
function pickDailyQuests(dayKey: string, userIdStr: string): QuestTemplate[] {
  // Simple hash-based shuffle so every user gets different quests
  let seed = 0;
  const combined = dayKey + userIdStr;
  for (let i = 0; i < combined.length; i++) {
    seed = ((seed << 5) - seed + combined.charCodeAt(i)) | 0;
  }

  const shuffled = [...QUEST_TEMPLATES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) | 0;
    const j = ((seed >>> 16) & 0x7fff) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}

// ── Queries ──────────────────────────────────────────────────────────

/** Get today's quests for the current user (auto-generates if missing) */
export const getMyQuests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const dayKey = getTodayKey();
    const existing = await ctx.db
      .query("quests")
      .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
      .unique();

    if (existing) return existing;

    // Return template data so the frontend can show them while the mutation seeds them
    const templates = pickDailyQuests(dayKey, userId);
    return {
      _id: null as unknown,
      userId,
      dayKey,
      questSlots: templates.map((t) => ({
        questId: t.id,
        title: t.title,
        description: t.description,
        target: t.target,
        progress: 0,
        completed: false,
        claimed: false,
        reward: t.reward,
      })),
    };
  },
});

/** Get current shard balance + owned cosmetics */
export const getMyCosmetics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

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

    const dayKey = getTodayKey();
    const existing = await ctx.db
      .query("quests")
      .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
      .unique();

    if (existing) return existing._id;

    const templates = pickDailyQuests(dayKey, userId);
    return await ctx.db.insert("quests", {
      userId,
      dayKey,
      questSlots: templates.map((t) => ({
        questId: t.id,
        title: t.title,
        description: t.description,
        target: t.target,
        progress: 0,
        completed: false,
        claimed: false,
        reward: t.reward,
      })),
    });
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

    const dayKey = getTodayKey();
    const questDoc = await ctx.db
      .query("quests")
      .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
      .unique();

    if (!questDoc) return; // no quests seeded yet

    const updated = questDoc.questSlots.map((slot) => {
      if (slot.completed) return slot;

      let increment = 0;

      // Match quest conditions
      if (slot.questId === "play_classic_1" || slot.questId === "play_classic_3") {
        if (args.mode === "classic") increment = 1;
      } else if (slot.questId === "play_hard_1") {
        if (args.mode === "hard") increment = 1;
      } else if (slot.questId === "play_timed_1") {
        if (args.mode === "timed") increment = 1;
      } else if (slot.questId === "win_any_1" || slot.questId === "win_any_2") {
        if (args.won) increment = 1;
      } else if (slot.questId === "play_any_2" || slot.questId === "play_any_3") {
        increment = 1;
      } else if (slot.questId === "green_letters_5" || slot.questId === "green_letters_10") {
        increment = args.greenLetters;
      }

      if (increment === 0) return slot;

      const newProgress = Math.min(slot.progress + increment, slot.target);
      return {
        ...slot,
        progress: newProgress,
        completed: newProgress >= slot.target,
      };
    });

    await ctx.db.patch(questDoc._id, { questSlots: updated });
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
    const dayKey = getTodayKey();
    const questDoc = await ctx.db
      .query("quests")
      .withIndex("by_user_and_day", (q) => q.eq("userId", args.userId).eq("dayKey", dayKey))
      .unique();

    if (!questDoc) return;

    const updated = questDoc.questSlots.map((slot) => {
      if (slot.completed) return slot;

      let increment = 0;

      if (slot.questId === "play_classic_1" || slot.questId === "play_classic_3") {
        if (args.mode === "classic") increment = 1;
      } else if (slot.questId === "play_hard_1") {
        if (args.mode === "hard") increment = 1;
      } else if (slot.questId === "play_timed_1") {
        if (args.mode === "timed") increment = 1;
      } else if (slot.questId === "win_any_1" || slot.questId === "win_any_2") {
        if (args.won) increment = 1;
      } else if (slot.questId === "play_any_2" || slot.questId === "play_any_3") {
        increment = 1;
      } else if (slot.questId === "green_letters_5" || slot.questId === "green_letters_10") {
        increment = args.greenLetters;
      }

      if (increment === 0) return slot;

      const newProgress = Math.min(slot.progress + increment, slot.target);
      return {
        ...slot,
        progress: newProgress,
        completed: newProgress >= slot.target,
      };
    });

    await ctx.db.patch(questDoc._id, { questSlots: updated });
  },
});

/** Claim a completed quest's shard reward */
export const claimQuestReward = mutation({
  args: { questId: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const dayKey = getTodayKey();
    const questDoc = await ctx.db
      .query("quests")
      .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
      .unique();

    if (!questDoc) throw new Error("No quests found");

    const slot = questDoc.questSlots.find((s) => s.questId === args.questId);
    if (!slot) throw new Error("Quest not found");
    if (!slot.completed) throw new Error("Quest not completed yet");
    if (slot.claimed) throw new Error("Already claimed");

    // Mark as claimed
    const updatedSlots = questDoc.questSlots.map((s) =>
      s.questId === args.questId ? { ...s, claimed: true } : s
    );
    await ctx.db.patch(questDoc._id, { questSlots: updatedSlots });

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

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "quest reward claimed",
      properties: {
        quest_id: args.questId,
        shards_earned: slot.reward,
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

    if (wallet) {
      await ctx.db.patch(wallet._id, {
        shards: wallet.shards - item.cost,
        ownedCosmetics: [...owned, item.id],
      });
    } else {
      await ctx.db.insert("userCosmetics", {
        userId,
        shards: -item.cost, // shouldn't happen since we check above
        ownedCosmetics: [item.id],
        equippedCosmetics: {},
      });
    }

    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "cosmetic purchased",
      properties: {
        cosmetic_id: item.id,
        cosmetic_name: item.name,
        cosmetic_category: item.category,
        shards_spent: item.cost,
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

    const equipped = { ...wallet.equippedCosmetics };
    // Toggle: if already equipped, unequip
    const slotKey = "theme";

    if (equipped[slotKey] === item.id) {
      equipped[slotKey] = undefined;
    } else {
      equipped[slotKey] = item.id;
    }

    await ctx.db.patch(wallet._id, { equippedCosmetics: equipped });

    const isNowEquipped = equipped[slotKey] === item.id;
    await ctx.scheduler.runAfter(0, internal.posthog.captureEvent, {
      distinctId: userId,
      event: "cosmetic equipped",
      properties: {
        cosmetic_id: item.id,
        cosmetic_name: item.name,
        cosmetic_category: item.category,
        equipped: isNowEquipped,
      },
    });
  },
});
