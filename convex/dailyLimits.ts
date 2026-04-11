import { Id } from "./_generated/dataModel";
import { MutationCtx, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const DAILY_MODE_ROUND_LIMIT = 3;
export const LIMITED_MODES = ["classic", "hard", "timed"] as const;
export type LimitedMode = (typeof LIMITED_MODES)[number];

export const getTodayKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
};

const getMetricForMode = (mode: LimitedMode) => `daily_rounds_${mode}`;

export const buildModeStatus = (played: number) => ({
  played,
  remaining: Math.max(0, DAILY_MODE_ROUND_LIMIT - played),
  reached: played >= DAILY_MODE_ROUND_LIMIT,
});

const getExistingCounter = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  mode: LimitedMode,
  dayKey: string,
) =>
  await ctx.db
    .query("analyticsCounters")
    .withIndex("by_metric_user_and_day", (q) =>
      q.eq("metric", getMetricForMode(mode)).eq("userId", userId).eq("dayKey", dayKey),
    )
    .unique();

export const consumeDailyRoundForUser = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  mode: LimitedMode,
) => {
  const dayKey = getTodayKey();
  const existing = await getExistingCounter(ctx, userId, mode, dayKey);
  const currentPlayed = existing?.value ?? 0;

  if (currentPlayed >= DAILY_MODE_ROUND_LIMIT) {
    throw new Error(`Daily limit reached for ${mode} mode. Come back tomorrow.`);
  }

  const nextPlayed = currentPlayed + 1;

  if (existing) {
    await ctx.db.patch(existing._id, { value: nextPlayed });
  } else {
    await ctx.db.insert("analyticsCounters", {
      metric: getMetricForMode(mode),
      userId,
      dayKey,
      value: nextPlayed,
    });
  }

  return {
    mode,
    ...buildModeStatus(nextPlayed),
    limit: DAILY_MODE_ROUND_LIMIT,
    dayKey,
  };
};

export const syncDailyRoundUsageForUser = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  mode: LimitedMode,
  usedRounds: number,
) => {
  const clampedUsedRounds = Math.min(Math.max(usedRounds, 0), DAILY_MODE_ROUND_LIMIT);
  const dayKey = getTodayKey();
  const existing = await getExistingCounter(ctx, userId, mode, dayKey);

  if (existing) {
    if (existing.value >= clampedUsedRounds) {
      return {
        mode,
        ...buildModeStatus(existing.value),
        limit: DAILY_MODE_ROUND_LIMIT,
        dayKey,
      };
    }

    await ctx.db.patch(existing._id, { value: clampedUsedRounds });
  } else {
    await ctx.db.insert("analyticsCounters", {
      metric: getMetricForMode(mode),
      userId,
      dayKey,
      value: clampedUsedRounds,
    });
  }

  return {
    mode,
    ...buildModeStatus(clampedUsedRounds),
    limit: DAILY_MODE_ROUND_LIMIT,
    dayKey,
  };
};

export const getMyDailyRoundLimits = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    const dayKey = getTodayKey();

    if (!userId) {
      return {
        dayKey,
        limit: DAILY_MODE_ROUND_LIMIT,
        modes: {
          classic: buildModeStatus(0),
          hard: buildModeStatus(0),
          timed: buildModeStatus(0),
        },
      };
    }

    const counts = {
      classic: 0,
      hard: 0,
      timed: 0,
    };

    for (const mode of LIMITED_MODES) {
      const counter = await ctx.db
        .query("analyticsCounters")
        .withIndex("by_metric_user_and_day", (q) =>
          q.eq("metric", getMetricForMode(mode)).eq("userId", userId).eq("dayKey", dayKey),
        )
        .unique();

      counts[mode] = counter?.value ?? 0;
    }

    return {
      dayKey,
      limit: DAILY_MODE_ROUND_LIMIT,
      modes: {
        classic: buildModeStatus(counts.classic),
        hard: buildModeStatus(counts.hard),
        timed: buildModeStatus(counts.timed),
      },
    };
  },
});

export const consumeDailyRound = mutation({
  args: {
    mode: v.union(v.literal("classic"), v.literal("hard"), v.literal("timed")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in");
    }

    return await consumeDailyRoundForUser(ctx, userId, args.mode);
  },
});
