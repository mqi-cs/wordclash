import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import {
  DAILY_MODE_ROUND_LIMIT,
  LimitedMode,
  consumeDailyRoundForUser,
  getTodayKey,
  syncDailyRoundUsageForUser,
} from "./dailyLimits";
import { applyStatsUpdate } from "./stats";
import {
  isRoundInProgress,
  normalizeRoundForMode,
  summarizeSeries,
  type LeaderboardMode,
  type RankingStatus,
} from "./leaderboardScoring";

type RoundStatus = "in_progress" | "won" | "lost" | "abandoned";
type RankingPeriod = "daily" | "weekly";
type LeaderboardSeriesDoc = Doc<"leaderboardSeries">;
type LeaderboardWeeklyBestDoc = Doc<"leaderboardWeeklyBest">;
type LeaderboardRound = LeaderboardSeriesDoc["rounds"][number];

const leaderboardModeValidator = v.union(
  v.literal("classic"),
  v.literal("hard"),
  v.literal("timed"),
);

const rankingPeriodValidator = v.union(v.literal("daily"), v.literal("weekly"));

const roundImportValidator = v.object({
  slot: v.number(),
  status: v.union(
    v.literal("in_progress"),
    v.literal("won"),
    v.literal("lost"),
    v.literal("abandoned"),
  ),
  rawGuesses: v.optional(v.number()),
  hintUses: v.optional(v.number()),
  adjustedScore: v.optional(v.number()),
  wordsCompleted: v.optional(v.number()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
});

type ComparableRanking = {
  sortScore: number;
  totalHintsUsed: number;
  completedAt: number;
  usernameLower: string;
};

const getWeekKey = (timestamp: number = Date.now()) => {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

const getUserDisplayInfo = async (
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) => {
  const user = await ctx.db.get(userId);
  const displayName =
    user?.username?.trim() ||
    user?.name?.trim() ||
    user?.googleName?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "Unknown User";

  return {
    displayName,
    usernameLower: displayName.toLowerCase(),
  };
};

const compareRankables = (left: ComparableRanking, right: ComparableRanking) => {
  if (left.sortScore !== right.sortScore) {
    return left.sortScore - right.sortScore;
  }

  if (left.totalHintsUsed !== right.totalHintsUsed) {
    return left.totalHintsUsed - right.totalHintsUsed;
  }

  if (left.completedAt !== right.completedAt) {
    return left.completedAt - right.completedAt;
  }

  return left.usernameLower.localeCompare(right.usernameLower);
};

const buildComparableFromSeries = (
  series: Pick<
    LeaderboardSeriesDoc,
    "sortScore" | "totalHintsUsed" | "completedAt" | "usernameLower"
  >,
): ComparableRanking => ({
  sortScore: series.sortScore ?? Number.MAX_SAFE_INTEGER,
  totalHintsUsed: series.totalHintsUsed,
  completedAt: series.completedAt ?? Number.MAX_SAFE_INTEGER,
  usernameLower: series.usernameLower,
});

const patchSeries = async (
  ctx: MutationCtx,
  seriesId: Id<"leaderboardSeries">,
  updates: Partial<Omit<LeaderboardSeriesDoc, "_id" | "_creationTime" | "userId" | "mode" | "dayKey" | "weekKey">>,
) => {
  const sanitizedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  );
  await ctx.db.patch(seriesId, sanitizedUpdates);
};

const upsertWeeklyBest = async (
  ctx: MutationCtx,
  series: LeaderboardSeriesDoc,
) => {
  if (series.rankingStatus !== "qualified" || series.totalScore === undefined || series.sortScore === undefined || series.completedAt === undefined) {
    return;
  }

  const existing = await ctx.db
    .query("leaderboardWeeklyBest")
    .withIndex("by_user_mode_week", (q) =>
      q.eq("userId", series.userId).eq("mode", series.mode).eq("weekKey", series.weekKey),
    )
    .unique();

  const nextComparable = buildComparableFromSeries(series);

  if (!existing) {
    await ctx.db.insert("leaderboardWeeklyBest", {
      userId: series.userId,
      mode: series.mode,
      weekKey: series.weekKey,
      sourceSeriesId: series._id,
      sourceDayKey: series.dayKey,
      totalScore: series.totalScore,
      sortScore: series.sortScore,
      totalHintsUsed: series.totalHintsUsed,
      completedAt: series.completedAt,
      displayName: series.displayName,
      usernameLower: series.usernameLower,
      rounds: series.rounds,
    });
    return;
  }

  const existingComparable: ComparableRanking = {
    sortScore: existing.sortScore,
    totalHintsUsed: existing.totalHintsUsed,
    completedAt: existing.completedAt,
    usernameLower: existing.usernameLower,
  };

  if (compareRankables(nextComparable, existingComparable) >= 0) {
    return;
  }

  await ctx.db.patch(existing._id, {
    sourceSeriesId: series._id,
    sourceDayKey: series.dayKey,
    totalScore: series.totalScore,
    sortScore: series.sortScore,
    totalHintsUsed: series.totalHintsUsed,
    completedAt: series.completedAt,
    displayName: series.displayName,
    usernameLower: series.usernameLower,
    rounds: series.rounds,
  });
};

const getDailySeriesForUser = async (
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  mode: LeaderboardMode,
  dayKey: string,
) =>
  (await ctx.db
    .query("leaderboardSeries")
    .withIndex("by_user_mode_day", (q) =>
      q.eq("userId", userId).eq("mode", mode).eq("dayKey", dayKey),
    )
    .collect())
    .sort((left, right) => {
      if (left.rounds.length !== right.rounds.length) {
        return right.rounds.length - left.rounds.length;
      }
      return right._creationTime - left._creationTime;
    })[0] ?? null;

const toCell = (mode: LeaderboardMode, round: LeaderboardRound | undefined) => {
  if (!round) {
    return { kind: "empty" as const };
  }

  if (isRoundInProgress(mode, round)) {
    return { kind: "empty" as const };
  }

  if (mode === "timed") {
    if (round.status === "abandoned") {
      return { kind: "failed" as const };
    }
    return {
      kind: "score" as const,
      value: round.wordsCompleted ?? round.adjustedScore ?? 0,
    };
  }

  if (round.status === "won") {
    return {
      kind: "score" as const,
      value: round.rawGuesses ?? round.adjustedScore ?? 0,
    };
  }

  return { kind: "failed" as const };
};

const toSeriesRow = (
  mode: LeaderboardMode,
  series:
    | Pick<
        LeaderboardSeriesDoc,
        "userId" | "displayName" | "rankingStatus" | "rounds" | "totalScore" | "dayKey" | "totalHintsUsed" | "completedAt"
      >
    | Pick<
        LeaderboardWeeklyBestDoc,
        "userId" | "displayName" | "rounds" | "totalScore" | "sourceDayKey" | "totalHintsUsed" | "completedAt"
      > & { rankingStatus?: RankingStatus },
  rank?: number,
) => {
  const rounds = [...series.rounds].sort((a, b) => a.slot - b.slot);
  const cells = [1, 2, 3].map((slot) => toCell(mode, rounds.find((round) => round.slot === slot)));
  const rankingStatus =
    "rankingStatus" in series && series.rankingStatus
      ? series.rankingStatus
      : "qualified";

  return {
    userId: series.userId,
    username: series.displayName,
    ...(typeof rank === "number" ? { rank } : {}),
    status: rankingStatus,
    cells,
    total:
      rankingStatus === "qualified" && typeof series.totalScore === "number"
        ? { kind: "score" as const, value: series.totalScore }
        : rankingStatus === "disqualified"
          ? { kind: "failed" as const }
          : { kind: "empty" as const },
    ...(rankingStatus === "qualified"
      ? {
          totalHintsUsed: series.totalHintsUsed,
          completedAt: series.completedAt,
        }
      : {}),
    ...("sourceDayKey" in series && series.sourceDayKey ? { sourceDayKey: series.sourceDayKey } : {}),
  };
};

const getQualifiedRank = async (
  ctx: QueryCtx,
  mode: LeaderboardMode,
  candidate: ComparableRanking,
) => {
  const dayKey = getTodayKey();
  let aheadCount = 0;

  for await (const series of ctx.db
    .query("leaderboardSeries")
    .withIndex(
      "by_mode_day_status_sort_hints_done_name",
      (q) => q.eq("mode", mode).eq("dayKey", dayKey).eq("rankingStatus", "qualified"),
    )) {
    const comparison = compareRankables(buildComparableFromSeries(series), candidate);
    if (comparison < 0) {
      aheadCount += 1;
      continue;
    }
    break;
  }

  return aheadCount + 1;
};

export const startSoloRound = mutation({
  args: {
    mode: leaderboardModeValidator,
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in to start a ranked round");
    }

    const now = Date.now();
    const dayKey = getTodayKey();
    const weekKey = getWeekKey(now);
    const { displayName, usernameLower } = await getUserDisplayInfo(ctx, userId);
    const existing = await getDailySeriesForUser(ctx, userId, args.mode, dayKey);
    await syncDailyRoundUsageForUser(ctx, userId, args.mode, existing?.rounds.length ?? 0);

    if (existing?.rounds.some((round) => isRoundInProgress(args.mode, round))) {
      throw new Error("Finish or abandon your current ranked round first.");
    }

    const nextSlot = (existing?.rounds.length ?? 0) + 1;
    if (nextSlot > DAILY_MODE_ROUND_LIMIT) {
      throw new Error(`Daily limit reached for ${args.mode} mode. Come back tomorrow.`);
    }

    await consumeDailyRoundForUser(ctx, userId, args.mode);

    const nextRounds = [
      ...(existing?.rounds ?? []),
      normalizeRoundForMode(args.mode, {
        slot: nextSlot,
        status: "in_progress",
        startedAt: now,
      }),
    ];
    const summary = summarizeSeries(args.mode, nextRounds, DAILY_MODE_ROUND_LIMIT);

    if (!existing) {
      await ctx.db.insert("leaderboardSeries", {
        userId,
        mode: args.mode,
        dayKey,
        weekKey,
        displayName,
        usernameLower,
        rounds: nextRounds,
        rankingStatus: summary.rankingStatus,
        totalHintsUsed: summary.totalHintsUsed,
        ...(summary.totalScore !== undefined ? { totalScore: summary.totalScore } : {}),
        ...(summary.sortScore !== undefined ? { sortScore: summary.sortScore } : {}),
        ...(summary.completedAt !== undefined ? { completedAt: summary.completedAt } : {}),
      });
    } else {
      await patchSeries(ctx, existing._id, {
        displayName,
        usernameLower,
        rounds: nextRounds,
        rankingStatus: summary.rankingStatus,
        totalHintsUsed: summary.totalHintsUsed,
        totalScore: summary.totalScore,
        sortScore: summary.sortScore,
        completedAt: summary.completedAt,
      });
    }

    return {
      slot: nextSlot,
      dayKey,
      weekKey,
    };
  },
});

export const finishSoloRound = mutation({
  args: {
    mode: leaderboardModeValidator,
    slot: v.number(),
    won: v.boolean(),
    greenLetters: v.number(),
    rawGuesses: v.optional(v.number()),
    hintUses: v.optional(v.number()),
    wordsCompleted: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in to finish a ranked round");
    }

    const dayKey = getTodayKey();
    const existing = await getDailySeriesForUser(ctx, userId, args.mode, dayKey);
    if (!existing) {
      throw new Error("No active ranked round found");
    }

    const targetRound = existing.rounds.find((round) => round.slot === args.slot);
    if (!targetRound || !isRoundInProgress(args.mode, targetRound)) {
      throw new Error("Ranked round is not active");
    }

    const now = Date.now();
    const { displayName, usernameLower } = await getUserDisplayInfo(ctx, userId);
    const nextRounds = existing.rounds.map((round) => {
      if (round.slot !== args.slot) {
        return round;
      }

      if (args.mode === "timed") {
        const wordsCompleted = Math.max(0, args.wordsCompleted ?? 0);
        return normalizeRoundForMode(args.mode, {
          slot: args.slot,
          status: "won",
          startedAt: round.startedAt,
          finishedAt: now,
          wordsCompleted,
        });
      }

      const rawGuesses = args.rawGuesses ?? 0;
      const hintUses = Math.max(0, args.hintUses ?? 0);
      return normalizeRoundForMode(args.mode, {
        slot: args.slot,
        status: args.won ? "won" : "lost",
        startedAt: round.startedAt,
        finishedAt: now,
        rawGuesses,
        hintUses,
        adjustedScore: rawGuesses + hintUses,
      });
    });

    const summary = summarizeSeries(args.mode, nextRounds, DAILY_MODE_ROUND_LIMIT);
    const nextSeries: LeaderboardSeriesDoc = {
      ...existing,
      displayName,
      usernameLower,
      rounds: nextRounds,
      rankingStatus: summary.rankingStatus,
      totalHintsUsed: summary.totalHintsUsed,
      ...(summary.totalScore !== undefined ? { totalScore: summary.totalScore } : {}),
      ...(summary.sortScore !== undefined ? { sortScore: summary.sortScore } : {}),
      ...(summary.completedAt !== undefined ? { completedAt: summary.completedAt } : {}),
    };

    await patchSeries(ctx, existing._id, {
      displayName,
      usernameLower,
      rounds: nextRounds,
      rankingStatus: summary.rankingStatus,
      totalHintsUsed: summary.totalHintsUsed,
      totalScore: summary.totalScore,
      sortScore: summary.sortScore,
      completedAt: summary.completedAt,
    });

    if (nextSeries.rankingStatus === "qualified") {
      await upsertWeeklyBest(ctx, nextSeries);
    }

    await applyStatsUpdate(ctx, {
      userId,
      mode: args.mode,
      won: args.won,
      greenLetters: args.greenLetters,
      gameType: "solo",
    });

    return {
      rankingStatus: nextSeries.rankingStatus,
      slot: args.slot,
    };
  },
});

export const abandonSoloRound = mutation({
  args: {
    mode: leaderboardModeValidator,
    slot: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in to abandon a ranked round");
    }

    const dayKey = getTodayKey();
    const existing = await getDailySeriesForUser(ctx, userId, args.mode, dayKey);
    if (!existing) {
      return { abandoned: false };
    }

    const targetRound = existing.rounds.find((round) => round.slot === args.slot);
    if (!targetRound || !isRoundInProgress(args.mode, targetRound)) {
      return { abandoned: false };
    }

    const now = Date.now();
    const { displayName, usernameLower } = await getUserDisplayInfo(ctx, userId);
    const nextRounds = existing.rounds.map((round) =>
      round.slot === args.slot
        ? normalizeRoundForMode(args.mode, {
            slot: args.slot,
            status: "abandoned",
            startedAt: round.startedAt,
            finishedAt: now,
          })
        : round,
    );
    const summary = summarizeSeries(args.mode, nextRounds, DAILY_MODE_ROUND_LIMIT);

    await patchSeries(ctx, existing._id, {
      displayName,
      usernameLower,
      rounds: nextRounds,
      rankingStatus: summary.rankingStatus,
      totalHintsUsed: summary.totalHintsUsed,
      totalScore: summary.totalScore,
      sortScore: summary.sortScore,
      completedAt: summary.completedAt,
    });

    return { abandoned: true };
  },
});

export const importGuestDailySeries = mutation({
  args: {
    mode: leaderboardModeValidator,
    dayKey: v.string(),
    rounds: v.array(roundImportValidator),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in to import guest leaderboard progress");
    }

    const todayKey = getTodayKey();
    if (args.dayKey !== todayKey) {
      return { imported: false, reason: "expired" as const };
    }

    const existing = await getDailySeriesForUser(ctx, userId, args.mode, todayKey);
    if (existing) {
      return { imported: false, reason: "existing" as const };
    }

    const now = Date.now();
    const { displayName, usernameLower } = await getUserDisplayInfo(ctx, userId);
    const sanitizedRounds = args.rounds
      .slice(0, DAILY_MODE_ROUND_LIMIT)
      .sort((a, b) => a.slot - b.slot)
      .map((round, index) =>
        normalizeRoundForMode(args.mode, {
          ...round,
          slot: index + 1,
          importedFromGuest: true,
        }),
      );
    const summary = summarizeSeries(args.mode, sanitizedRounds, DAILY_MODE_ROUND_LIMIT);

    const seriesId = await ctx.db.insert("leaderboardSeries", {
      userId,
      mode: args.mode,
      dayKey: todayKey,
      weekKey: getWeekKey(now),
      displayName,
      usernameLower,
      rounds: sanitizedRounds,
      rankingStatus: summary.rankingStatus,
      totalHintsUsed: summary.totalHintsUsed,
      ...(summary.totalScore !== undefined ? { totalScore: summary.totalScore } : {}),
      ...(summary.sortScore !== undefined ? { sortScore: summary.sortScore } : {}),
      ...(summary.completedAt !== undefined ? { completedAt: summary.completedAt } : {}),
    });

    await syncDailyRoundUsageForUser(ctx, userId, args.mode, sanitizedRounds.length);

    if (summary.rankingStatus === "qualified" && summary.totalScore !== undefined && summary.sortScore !== undefined && summary.completedAt !== undefined) {
      await upsertWeeklyBest(ctx, {
        _id: seriesId,
        _creationTime: now,
        userId,
        mode: args.mode,
        dayKey: todayKey,
        weekKey: getWeekKey(now),
        displayName,
        usernameLower,
        rounds: sanitizedRounds,
        rankingStatus: summary.rankingStatus,
        totalHintsUsed: summary.totalHintsUsed,
        totalScore: summary.totalScore,
        sortScore: summary.sortScore,
        completedAt: summary.completedAt,
      });
    }

    return {
      imported: true,
      rankingStatus: summary.rankingStatus,
    };
  },
});

export const getLeaderboard = query({
  args: {
    mode: leaderboardModeValidator,
    period: rankingPeriodValidator,
  },
  handler: async (ctx, args) => {
    const viewerId = await auth.getUserId(ctx);

    if (args.period === "daily") {
      const dayKey = getTodayKey();
      const rankedDocs = await ctx.db
        .query("leaderboardSeries")
        .withIndex(
          "by_mode_day_status_sort_hints_done_name",
          (q) => q.eq("mode", args.mode).eq("dayKey", dayKey).eq("rankingStatus", "qualified"),
        )
        .take(10);

      const rankedRows = rankedDocs.map((doc, index) => toSeriesRow(args.mode, doc, index + 1));
      const isViewerRanked = viewerId ? rankedDocs.some((doc) => doc.userId === viewerId) : false;
      let viewerRow: ReturnType<typeof toSeriesRow> | null = null;

      if (viewerId && !isViewerRanked) {
        const viewerSeries = await getDailySeriesForUser(ctx, viewerId, args.mode, dayKey);
        if (viewerSeries) {
          let rank: number | undefined;
          if (viewerSeries.rankingStatus === "qualified") {
            rank = await getQualifiedRank(ctx, args.mode, buildComparableFromSeries(viewerSeries));
          }
          viewerRow = toSeriesRow(args.mode, viewerSeries, rank);
        }
      }

      return {
        period: args.period,
        dayKey,
        rankedRows,
        viewerRow,
      };
    }

    const weekKey = getWeekKey();
    const rankedDocs = await ctx.db
      .query("leaderboardWeeklyBest")
      .withIndex(
        "by_mode_week_sort_hints_done_name",
        (q) => q.eq("mode", args.mode).eq("weekKey", weekKey),
      )
      .take(10);

    const rankedRows = rankedDocs.map((doc, index) => toSeriesRow(args.mode, doc, index + 1));
    let viewerRow: ReturnType<typeof toSeriesRow> | null = null;

    if (viewerId && !rankedDocs.some((doc) => doc.userId === viewerId)) {
      const viewerWeekly = await ctx.db
        .query("leaderboardWeeklyBest")
        .withIndex("by_user_mode_week", (q) =>
          q.eq("userId", viewerId).eq("mode", args.mode).eq("weekKey", weekKey),
        )
        .unique();

      if (viewerWeekly) {
        viewerRow = toSeriesRow(args.mode, viewerWeekly);
      }
    }

    return {
      period: args.period,
      weekKey,
      rankedRows,
      viewerRow,
    };
  },
});

export const getGuestProjectedRank = query({
  args: {
    mode: leaderboardModeValidator,
    sortScore: v.optional(v.number()),
    totalHintsUsed: v.number(),
    completedAt: v.optional(v.number()),
    rankingStatus: v.union(
      v.literal("in_progress"),
      v.literal("qualified"),
      v.literal("disqualified"),
    ),
  },
  handler: async (ctx, args) => {
    if (args.rankingStatus !== "qualified" || args.sortScore === undefined || args.completedAt === undefined) {
      return { rank: null };
    }

    const rank = await getQualifiedRank(ctx, args.mode, {
      sortScore: args.sortScore,
      totalHintsUsed: args.totalHintsUsed,
      completedAt: args.completedAt,
      usernameLower: "you (guest)",
    });

    return { rank };
  },
});
