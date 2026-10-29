import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { MutationCtx, internalMutation } from "./_generated/server";

export const ANALYTICS_METRICS = {
  gamesCompleted: "games_completed",
  gamesCreated: "games_created",
  gamesStarted: "games_started",
} as const;

type AnalyticsMetric = (typeof ANALYTICS_METRICS)[keyof typeof ANALYTICS_METRICS];

type CounterKey = {
  metric: AnalyticsMetric;
  userId?: Id<"users">;
  dayKey?: string;
};

type MetricSnapshot = {
  dayKey: string;
  userTotalCount: number;
  userTodayCount: number;
};

const analyticsMetricValidator = v.union(
  v.literal(ANALYTICS_METRICS.gamesCompleted),
  v.literal(ANALYTICS_METRICS.gamesCreated),
  v.literal(ANALYTICS_METRICS.gamesStarted),
);

const getUtcDayKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

// Each counter is a single row keyed by (metric, userId?, dayKey?), with the
// unused parts left unset. Look it up with every key part pinned (unset ones
// as undefined) so the read stays one row; matching on a shorter prefix reads
// every per-user and per-day row for the metric, which grows without bound.
const getCounter = async (ctx: MutationCtx, key: CounterKey) =>
  await ctx.db
    .query("analyticsCounters")
    .withIndex("by_metric_user_and_day", (q) =>
      q.eq("metric", key.metric).eq("userId", key.userId).eq("dayKey", key.dayKey),
    )
    .first();

const incrementCounter = async (ctx: MutationCtx, key: CounterKey) => {
  const existing = await getCounter(ctx, key);
  if (existing) {
    const nextValue = existing.value + 1;
    await ctx.db.patch(existing._id, { value: nextValue });
    return nextValue;
  }

  await ctx.db.insert("analyticsCounters", {
    metric: key.metric,
    ...(key.userId ? { userId: key.userId } : {}),
    ...(key.dayKey ? { dayKey: key.dayKey } : {}),
    value: 1,
  });

  return 1;
};

// Per-user counters are updated inline: only that player's own mutations
// touch them. The site-wide counters are touched by every game, so updating
// them inline made every game-creating mutation conflict with every other;
// they are updated in a scheduled mutation instead, off the player's path.
export const incrementMetric = async (
  ctx: MutationCtx,
  metric: AnalyticsMetric,
  userId: Id<"users">,
  timestamp: number = Date.now(),
): Promise<MetricSnapshot> => {
  const dayKey = getUtcDayKey(timestamp);
  const userTotalCount = await incrementCounter(ctx, { metric, userId });
  const userTodayCount = await incrementCounter(ctx, { metric, userId, dayKey });
  await ctx.scheduler.runAfter(0, internal.analytics.incrementGlobalMetric, { metric, dayKey });

  return {
    dayKey,
    userTotalCount,
    userTodayCount,
  };
};

export const incrementGlobalMetric = internalMutation({
  args: { metric: analyticsMetricValidator, dayKey: v.string() },
  handler: async (ctx, args) => {
    await incrementCounter(ctx, { metric: args.metric });
    await incrementCounter(ctx, { metric: args.metric, dayKey: args.dayKey });
  },
});
