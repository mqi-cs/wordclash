import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

const DAILY_MODE_ROUND_LIMIT = 3;
const LIMITED_MODES = ["classic", "hard", "timed"] as const;
type LimitedMode = (typeof LIMITED_MODES)[number];

const getTodayKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
};

const getMetricForMode = (mode: LimitedMode) => `daily_rounds_${mode}`;

const buildModeStatus = (played: number) => ({
  played,
  remaining: Math.max(0, DAILY_MODE_ROUND_LIMIT - played),
  reached: played >= DAILY_MODE_ROUND_LIMIT,
});

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

    const dayKey = getTodayKey();
    const metric = getMetricForMode(args.mode);
    const existing = await ctx.db
      .query("analyticsCounters")
      .withIndex("by_metric_user_and_day", (q) =>
        q.eq("metric", metric).eq("userId", userId).eq("dayKey", dayKey),
      )
      .unique();

    const currentPlayed = existing?.value ?? 0;
    if (currentPlayed >= DAILY_MODE_ROUND_LIMIT) {
      throw new Error(`Daily limit reached for ${args.mode} mode. Come back tomorrow.`);
    }

    const nextPlayed = currentPlayed + 1;

    if (existing) {
      await ctx.db.patch(existing._id, { value: nextPlayed });
    } else {
      await ctx.db.insert("analyticsCounters", {
        metric,
        userId,
        dayKey,
        value: nextPlayed,
      });
    }

    return {
      mode: args.mode,
      ...buildModeStatus(nextPlayed),
      limit: DAILY_MODE_ROUND_LIMIT,
      dayKey,
    };
  },
});
