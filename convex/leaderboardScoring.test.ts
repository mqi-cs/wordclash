import { describe, expect, it } from "vitest";

import {
  isRoundInProgress,
  normalizeRoundForMode,
  summarizeSeries,
} from "./leaderboardScoring";

describe("leaderboardScoring timed mode", () => {
  it("keeps a newly started timed round in progress", () => {
    const round = normalizeRoundForMode("timed", {
      slot: 1,
      status: "in_progress",
      startedAt: 1_000,
    });

    expect(round.status).toBe("in_progress");
    expect(round.finishedAt).toBeUndefined();
    expect(round.wordsCompleted).toBeUndefined();
    expect(isRoundInProgress("timed", round)).toBe(true);
  });

  it("totals timed rounds by words completed", () => {
    const summary = summarizeSeries(
      "timed",
      [
        normalizeRoundForMode("timed", {
          slot: 1,
          status: "won",
          startedAt: 1_000,
          finishedAt: 2_000,
          wordsCompleted: 4,
        }),
        normalizeRoundForMode("timed", {
          slot: 2,
          status: "won",
          startedAt: 3_000,
          finishedAt: 4_000,
          wordsCompleted: 7,
        }),
        normalizeRoundForMode("timed", {
          slot: 3,
          status: "won",
          startedAt: 5_000,
          finishedAt: 6_000,
          wordsCompleted: 2,
        }),
      ],
      3,
    );

    expect(summary.rankingStatus).toBe("qualified");
    expect(summary.totalScore).toBe(13);
    expect(summary.sortScore).toBe(-13);
    expect(summary.completedAt).toBe(6_000);
  });

  it("treats legacy timed rounds without finishedAt as still active", () => {
    const summary = summarizeSeries(
      "timed",
      [
        {
          slot: 1,
          status: "won",
          wordsCompleted: 0,
          adjustedScore: 0,
          hintUses: 0,
        },
      ],
      3,
    );

    expect(isRoundInProgress("timed", { status: "won", finishedAt: undefined })).toBe(true);
    expect(summary.rankingStatus).toBe("in_progress");
    expect(summary.totalScore).toBeUndefined();
  });
});

describe("leaderboardScoring classic and hard ranking hierarchy", () => {
  it("qualifies completed series even when some rounds were lost", () => {
    const summary = summarizeSeries(
      "classic",
      [
        normalizeRoundForMode("classic", {
          slot: 1,
          status: "won",
          startedAt: 1_000,
          finishedAt: 2_000,
          rawGuesses: 3,
          hintUses: 1,
          adjustedScore: 4,
        }),
        normalizeRoundForMode("classic", {
          slot: 2,
          status: "lost",
          startedAt: 3_000,
          finishedAt: 4_000,
          rawGuesses: 6,
          hintUses: 0,
          adjustedScore: 6,
        }),
        normalizeRoundForMode("classic", {
          slot: 3,
          status: "won",
          startedAt: 5_000,
          finishedAt: 6_000,
          rawGuesses: 4,
          hintUses: 2,
          adjustedScore: 6,
        }),
      ],
      3,
    );

    expect(summary.rankingStatus).toBe("qualified");
    expect(summary.totalScore).toBe(7);
    expect(summary.completedAt).toBe(6_000);
  });

  it("ranks solved words ahead of lower guess totals", () => {
    const twoSolvedSummary = summarizeSeries(
      "hard",
      [
        normalizeRoundForMode("hard", {
          slot: 1,
          status: "won",
          startedAt: 1_000,
          finishedAt: 2_000,
          rawGuesses: 6,
          hintUses: 0,
          adjustedScore: 6,
        }),
        normalizeRoundForMode("hard", {
          slot: 2,
          status: "won",
          startedAt: 3_000,
          finishedAt: 4_000,
          rawGuesses: 6,
          hintUses: 0,
          adjustedScore: 6,
        }),
        normalizeRoundForMode("hard", {
          slot: 3,
          status: "lost",
          startedAt: 5_000,
          finishedAt: 6_000,
          rawGuesses: 1,
          hintUses: 0,
          adjustedScore: 1,
        }),
      ],
      3,
    );

    const oneSolvedSummary = summarizeSeries(
      "hard",
      [
        normalizeRoundForMode("hard", {
          slot: 1,
          status: "won",
          startedAt: 1_000,
          finishedAt: 2_000,
          rawGuesses: 1,
          hintUses: 0,
          adjustedScore: 1,
        }),
        normalizeRoundForMode("hard", {
          slot: 2,
          status: "lost",
          startedAt: 3_000,
          finishedAt: 4_000,
          rawGuesses: 1,
          hintUses: 0,
          adjustedScore: 1,
        }),
        normalizeRoundForMode("hard", {
          slot: 3,
          status: "lost",
          startedAt: 5_000,
          finishedAt: 6_000,
          rawGuesses: 1,
          hintUses: 0,
          adjustedScore: 1,
        }),
      ],
      3,
    );

    expect(twoSolvedSummary.rankingStatus).toBe("qualified");
    expect(oneSolvedSummary.rankingStatus).toBe("qualified");
    expect(twoSolvedSummary.sortScore).toBeLessThan(oneSolvedSummary.sortScore ?? Number.MAX_SAFE_INTEGER);
  });
});
