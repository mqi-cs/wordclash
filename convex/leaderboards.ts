import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { auth } from "./auth";
import {
  DAILY_MODE_ROUND_LIMIT,
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

export const leaderboardModeValidator = v.union(
  v.literal("classic"),
  v.literal("hard"),
  v.literal("timed"),
);

const rankingPeriodValidator = v.union(v.literal("daily"), v.literal("weekly"));

type ComparableRanking = {
  sortScore: number;
  totalHintsUsed: number;
  completedAt: number;
  usernameLower: string;
};

export const getWeekKey = (timestamp: number = Date.now()) => {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

export const getUserDisplayInfo = async (
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

export const getDailySeriesForUser = async (
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

// Opens the next slot of today's ranked series and consumes a daily round.
// Returns the new slot number.
export const startSeriesRound = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  mode: LeaderboardMode,
  dayKey: string,
) => {
  const now = Date.now();
  const { displayName, usernameLower } = await getUserDisplayInfo(ctx, userId);
  const existing = await getDailySeriesForUser(ctx, userId, mode, dayKey);
  await syncDailyRoundUsageForUser(ctx, userId, mode, existing?.rounds.length ?? 0);

  if (existing?.rounds.some((round) => isRoundInProgress(mode, round))) {
    throw new ConvexError("Finish your current ranked round first.");
  }

  const nextSlot = (existing?.rounds.length ?? 0) + 1;
  if (nextSlot > DAILY_MODE_ROUND_LIMIT) {
    throw new ConvexError(`Daily limit reached for ${mode} mode. Come back tomorrow.`);
  }

  await consumeDailyRoundForUser(ctx, userId, mode);

  const nextRounds = [
    ...(existing?.rounds ?? []),
    normalizeRoundForMode(mode, { slot: nextSlot, status: "in_progress", startedAt: now }),
  ];
  const summary = summarizeSeries(mode, nextRounds, DAILY_MODE_ROUND_LIMIT);

  if (!existing) {
    await ctx.db.insert("leaderboardSeries", {
      userId,
      mode,
      dayKey,
      weekKey: getWeekKey(now),
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

  return nextSlot;
};

type SoloRoundResult =
  | { mode: "timed"; wordsCompleted: number; greenLetters: number }
  | {
      mode: "classic" | "hard";
      won: boolean;
      rawGuesses: number;
      hintUses: number;
      greenLetters: number;
    };

// Records a finished ranked solo round on the daily series, the weekly best
// and the player's stats. Only called by soloRounds.ts with results it
// computed itself; clients never report results directly.
export const recordSoloRoundResult = async (
  ctx: MutationCtx,
  args: { userId: Id<"users">; dayKey: string; slot: number; result: SoloRoundResult },
) => {
  const { userId, dayKey, slot, result } = args;
  const mode = result.mode;
  const existing = await getDailySeriesForUser(ctx, userId, mode, dayKey);
  const targetRound = existing?.rounds.find((round) => round.slot === slot);

  if (existing && targetRound && isRoundInProgress(mode, targetRound)) {
    const now = Date.now();
    const { displayName, usernameLower } = await getUserDisplayInfo(ctx, userId);
    const nextRounds = existing.rounds.map((round) => {
      if (round.slot !== slot) {
        return round;
      }
      if (result.mode === "timed") {
        return normalizeRoundForMode(mode, {
          slot,
          status: "won",
          startedAt: round.startedAt,
          finishedAt: now,
          wordsCompleted: result.wordsCompleted,
        });
      }
      return normalizeRoundForMode(mode, {
        slot,
        status: result.won ? "won" : "lost",
        startedAt: round.startedAt,
        finishedAt: now,
        rawGuesses: result.rawGuesses,
        hintUses: result.hintUses,
        adjustedScore: result.rawGuesses + result.hintUses,
      });
    });

    const summary = summarizeSeries(mode, nextRounds, DAILY_MODE_ROUND_LIMIT);
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
  }

  await applyStatsUpdate(ctx, {
    userId,
    mode,
    won: result.mode === "timed" ? result.wordsCompleted > 0 : result.won,
    greenLetters: result.greenLetters,
    gameType: "solo",
  });
};

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
