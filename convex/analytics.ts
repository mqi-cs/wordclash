import { Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";

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
  totalCount: number;
  todayTotalCount: number;
  userTotalCount: number;
  userTodayCount: number;
};

const getUtcDayKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const getCounter = async (ctx: MutationCtx, key: CounterKey) => {
  if (key.userId && key.dayKey) {
    return await ctx.db
      .query("analyticsCounters")
      .withIndex("by_metric_user_and_day", (q) =>
        q.eq("metric", key.metric).eq("userId", key.userId).eq("dayKey", key.dayKey),
      )
      .unique();
  }

  if (key.userId) {
    return await ctx.db
      .query("analyticsCounters")
      .withIndex("by_metric_and_user", (q) =>
        q.eq("metric", key.metric).eq("userId", key.userId),
      )
      .unique();
  }

  if (key.dayKey) {
    return await ctx.db
      .query("analyticsCounters")
      .withIndex("by_metric_and_day", (q) =>
        q.eq("metric", key.metric).eq("dayKey", key.dayKey),
      )
      .unique();
  }

  return await ctx.db
    .query("analyticsCounters")
    .withIndex("by_metric", (q) => q.eq("metric", key.metric))
    .unique();
};

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

export const incrementMetric = async (
  ctx: MutationCtx,
  metric: AnalyticsMetric,
  userId: Id<"users">,
  timestamp: number = Date.now(),
): Promise<MetricSnapshot> => {
  const dayKey = getUtcDayKey(timestamp);
  const totalCount = await incrementCounter(ctx, { metric });
  const todayTotalCount = await incrementCounter(ctx, { metric, dayKey });
  const userTotalCount = await incrementCounter(ctx, { metric, userId });
  const userTodayCount = await incrementCounter(ctx, { metric, userId, dayKey });

  return {
    dayKey,
    totalCount,
    todayTotalCount,
    userTotalCount,
    userTodayCount,
  };
};
