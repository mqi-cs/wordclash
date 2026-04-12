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
    .collect();

const getCounterValue = (
  counters: Array<{ value: number }>,
) => counters.reduce((max, counter) => Math.max(max, counter.value), 0);

const collapseDuplicateCounters = async (
  ctx: MutationCtx,
  counters: Array<{ _id: Id<"analyticsCounters">; value: number }>,
  nextValue: number,
) => {
  if (counters.length === 0) {
    return;
  }

  const [primary, ...duplicates] = [...counters].sort((left, right) =>
    left._id < right._id ? -1 : 1,
  );

  await ctx.db.patch(primary._id, { value: nextValue });
  for (const duplicate of duplicates) {
    await ctx.db.delete(duplicate._id);
  }
};

export const consumeDailyRoundForUser = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  mode: LimitedMode,
) => {
  const dayKey = getTodayKey();
  const existing = await getExistingCounter(ctx, userId, mode, dayKey);
  const currentPlayed = getCounterValue(existing);

  if (currentPlayed >= DAILY_MODE_ROUND_LIMIT) {
    throw new Error(`Daily limit reached for ${mode} mode. Come back tomorrow.`);
  }

  const nextPlayed = currentPlayed + 1;

  if (existing.length > 0) {
    await collapseDuplicateCounters(ctx, existing, nextPlayed);
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
  const currentPlayed = getCounterValue(existing);

  if (existing.length > 0) {
    if (currentPlayed >= clampedUsedRounds) {
      if (existing.length > 1) {
        await collapseDuplicateCounters(ctx, existing, currentPlayed);
      }
      return {
        mode,
        ...buildModeStatus(currentPlayed),
        limit: DAILY_MODE_ROUND_LIMIT,
        dayKey,
      };
    }

    await collapseDuplicateCounters(ctx, existing, clampedUsedRounds);
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
      const counters = await ctx.db
        .query("analyticsCounters")
        .withIndex("by_metric_user_and_day", (q) =>
          q.eq("metric", getMetricForMode(mode)).eq("userId", userId).eq("dayKey", dayKey),
        )
        .collect();

      counts[mode] = getCounterValue(counters);
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
