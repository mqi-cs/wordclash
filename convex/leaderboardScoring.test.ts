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
