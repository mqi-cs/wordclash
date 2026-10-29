// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex as ConvexTestInstance } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { isAllowedRedirect } from "./auth";
import schema from "./schema";
import { reserveUsername } from "./usernames";

const modules = import.meta.glob("./**/*.ts");

type TestConvex = ConvexTestInstance<typeof schema>;

// Scheduled analytics actions are never run: fake timers stop them firing.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const createUser = async (t: TestConvex, username: string) => {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", { username, name: username }));
  // Convex Auth encodes "<userId>|<sessionId>" in the token subject.
  return { userId, as: t.withIdentity({ subject: `${userId}|session-${username}` }) };
};

const makeFriends = async (t: TestConvex, a: Id<"users">, b: Id<"users">) => {
  await t.run(async (ctx) =>
    ctx.db.insert("friendships", { user1Id: a, user2Id: b, status: "accepted", requesterId: a }),
  );
};

const setTargetWord = async (t: TestConvex, gameId: Id<"games">, targetWord: string) => {
  await t.run(async (ctx) => {
    const secret = await ctx.db
      .query("gameSecrets")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .unique();
    await ctx.db.patch(secret!._id, { targetWord });
  });
};

const startTwoPlayerLobby = async (t: TestConvex) => {
  const host = await createUser(t, "host");
  const guest = await createUser(t, "guest");
  const gameId = await host.as.mutation(api.games.createGame, { gameType: "multiplayer" });
  const game = await t.run(async (ctx) => ctx.db.get(gameId));
  await guest.as.mutation(api.games.joinGameByCode, { lobbyCode: game!.lobbyCode! });
  return { host, guest, gameId };
};

const startChallenge = async (t: TestConvex) => {
  const host = await createUser(t, "host");
  const friend = await createUser(t, "friend");
  await makeFriends(t, host.userId, friend.userId);
  const gameId = await host.as.mutation(api.games.createGame, { gameType: "challenge" });
  await host.as.mutation(api.games.inviteToGame, { gameId, friendId: friend.userId });
  const [invitation] = await friend.as.query(api.games.getIncomingInvitations, {});
  await friend.as.mutation(api.games.acceptInvitation, { invitationId: invitation._id });
  return { host, friend, gameId };
};

describe("auth redirects", () => {
  it("only allows our own origins", () => {
    expect(isAllowedRedirect("https://wordclash.co/play")).toBe(true);
    expect(isAllowedRedirect("https://www.wordclash.co")).toBe(true);
    expect(isAllowedRedirect("https://wordclash.co.evil.com/")).toBe(false);
    expect(isAllowedRedirect("https://wordclash.com")).toBe(false);
    expect(isAllowedRedirect("not a url")).toBe(false);
  });
});

describe("multiplayer guesses", () => {
  it("hides opponents' words until the game is finished", async () => {
    const t = convexTest(schema, modules);
    const { host, guest, gameId } = await startTwoPlayerLobby(t);
    await host.as.mutation(api.games.startGame, { gameId });
    await setTargetWord(t, gameId, "APPLE");

    await guest.as.mutation(api.guesses.submitGuess, { gameId, guess: "APPLE" });

    const hostView = await host.as.query(api.guesses.getGuesses, { gameId });
    expect(hostView).toHaveLength(1);
    expect(hostView[0].guess).toBe("");
    expect(hostView[0].evaluation).toEqual(Array(5).fill("correct"));

    const guestView = await guest.as.query(api.guesses.getGuesses, { gameId });
    expect(guestView[0].guess).toBe("APPLE");

    for (const word of ["CRANE", "SLATE", "MOUNT", "BRICK", "DUSTY", "FLING"]) {
      await host.as.mutation(api.guesses.submitGuess, { gameId, guess: word });
    }
    const finished = await host.as.query(api.games.getGame, { gameId });
    expect(finished!.status).toBe("finished");
    expect(finished!.winnerId).toBe(guest.userId);

    const revealed = await host.as.query(api.guesses.getGuesses, { gameId });
    expect(revealed.find((guess) => guess.playerId === guest.userId)!.guess).toBe("APPLE");
  });

  it("rejects guesses after the player has solved the word", async () => {
    const t = convexTest(schema, modules);
    const { host, guest, gameId } = await startTwoPlayerLobby(t);
    await host.as.mutation(api.games.startGame, { gameId });
    await setTargetWord(t, gameId, "APPLE");

    await guest.as.mutation(api.guesses.submitGuess, { gameId, guess: "APPLE" });
    await expect(
      guest.as.mutation(api.guesses.submitGuess, { gameId, guess: "CRANE" }),
    ).rejects.toThrow("You already solved this word");
  });

  it("lets the host change the lobby mode before starting", async () => {
    const t = convexTest(schema, modules);
    const { host, guest, gameId } = await startTwoPlayerLobby(t);

    await expect(
      guest.as.mutation(api.games.setLobbyMode, { gameId, mode: "timed" }),
    ).rejects.toThrow("Only the host can change the mode.");

    await host.as.mutation(api.games.setLobbyMode, { gameId, mode: "timed" });
    const secret = await t.run(async (ctx) =>
      ctx.db
        .query("gameSecrets")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .unique(),
    );
    expect(secret!.targetWords).toHaveLength(50);

    await host.as.mutation(api.games.startGame, { gameId });
    const game = await host.as.query(api.games.getGame, { gameId });
    expect(game!.mode).toBe("timed");
    expect(game!.gameEndTime).toBeGreaterThan(Date.now());
  });
});

describe("challenges", () => {
  it("only lets invited friends join", async () => {
    const t = convexTest(schema, modules);
    const host = await createUser(t, "host");
    const stranger = await createUser(t, "stranger");
    const gameId = await host.as.mutation(api.games.createGame, { gameType: "challenge" });

    await expect(
      host.as.mutation(api.games.inviteToGame, { gameId, friendId: stranger.userId }),
    ).rejects.toThrow("You can only invite friends");
    await expect(stranger.as.mutation(api.games.joinGame, { gameId })).rejects.toThrow(
      "You have not been invited to this challenge",
    );
  });

  it("enforces turns and ends once the other player has matched the winner's guesses", async () => {
    const t = convexTest(schema, modules);
    const { host, friend, gameId } = await startChallenge(t);
    await setTargetWord(t, gameId, "APPLE");

    await expect(
      friend.as.mutation(api.guesses.submitGuess, { gameId, guess: "CRANE" }),
    ).rejects.toThrow("It's not your turn yet");

    await host.as.mutation(api.guesses.submitGuess, { gameId, guess: "CRANE" });
    await friend.as.mutation(api.guesses.submitGuess, { gameId, guess: "SLATE" });
    await host.as.mutation(api.guesses.submitGuess, { gameId, guess: "APPLE" });

    let game = await host.as.query(api.games.getGame, { gameId });
    expect(game!.status).toBe("in_progress");

    // The friend gets one more turn to match the host's two guesses...
    await friend.as.mutation(api.guesses.submitGuess, { gameId, guess: "MOUNT" });

    // ...and then the game ends instead of stalling.
    game = await host.as.query(api.games.getGame, { gameId });
    expect(game!.status).toBe("finished");
    expect(game!.winnerId).toBe(host.userId);
  });

  it("starts the clock when a timed challenge is accepted", async () => {
    const t = convexTest(schema, modules);
    const host = await createUser(t, "host");
    const friend = await createUser(t, "friend");
    await makeFriends(t, host.userId, friend.userId);
    const gameId = await host.as.mutation(api.games.createGame, {
      gameType: "challenge",
      mode: "timed",
    });
    await host.as.mutation(api.games.inviteToGame, { gameId, friendId: friend.userId });
    const [invitation] = await friend.as.query(api.games.getIncomingInvitations, {});
    await friend.as.mutation(api.games.acceptInvitation, { invitationId: invitation._id });

    const game = await host.as.query(api.games.getGame, { gameId });
    expect(game!.status).toBe("in_progress");
    expect(game!.gameEndTime).toBeGreaterThan(Date.now());
  });
});

describe("stats", () => {
  it("counts a multiplayer result once, however often it is reported", async () => {
    const t = convexTest(schema, modules);
    const { host, guest, gameId } = await startTwoPlayerLobby(t);
    await host.as.mutation(api.games.startGame, { gameId });
    await setTargetWord(t, gameId, "APPLE");
    await host.as.mutation(api.guesses.submitGuess, { gameId, guess: "APPLE" });
    await guest.as.mutation(api.guesses.submitGuess, { gameId, guess: "APPLE" });

    for (let i = 0; i < 3; i += 1) {
      await host.as.mutation(api.stats.updateStats, {
        mode: "multiplayer",
        won: true,
        greenLetters: 5,
        gameId,
      });
    }

    const stats = await host.as.query(api.stats.getMyStats, {});
    expect(stats!.multiplayer_played).toBe(1);
  });

  it("refuses multiplayer results that don't reference a game", async () => {
    const t = convexTest(schema, modules);
    const player = await createUser(t, "player");
    await expect(
      player.as.mutation(api.stats.updateStats, { mode: "multiplayer", won: true, greenLetters: 5 }),
    ).rejects.toThrow("Multiplayer results must reference a game");
  });
});

const getSoloRound = async (t: TestConvex, mode: "classic" | "hard" | "timed") =>
  (await t.run(async (ctx) =>
    ctx.db
      .query("soloRounds")
      .filter((q) => q.eq(q.field("mode"), mode))
      .first(),
  ))!;

const getSeries = async (t: TestConvex, mode: "classic" | "hard" | "timed") =>
  (await t.run(async (ctx) =>
    ctx.db
      .query("leaderboardSeries")
      .filter((q) => q.eq(q.field("mode"), mode))
      .first(),
  ))!;

// Any valid word that isn't the answer.
const wrongGuessFor = (answer: string) => (answer === "CRANE" ? "SLATE" : "CRANE");

describe("ranked solo rounds", () => {
  it("scores guesses on the server and records the result once", async () => {
    const t = convexTest(schema, modules);
    const player = await createUser(t, "player");
    const started = await player.as.mutation(api.soloRounds.start, { mode: "classic" });
    expect(started).not.toHaveProperty("targetWords");
    const { targetWords } = await getSoloRound(t, "classic");
    const answer = targetWords[0];

    await expect(
      player.as.mutation(api.soloRounds.submitGuess, { mode: "classic", slot: started.slot, guess: "ZZZZZ" }),
    ).rejects.toThrow("Not in word list");

    const miss = await player.as.mutation(api.soloRounds.submitGuess, {
      mode: "classic",
      slot: started.slot,
      guess: wrongGuessFor(answer),
    });
    expect(miss).toMatchObject({ solved: false, roundOver: false, answer: null });

    const hit = await player.as.mutation(api.soloRounds.submitGuess, {
      mode: "classic",
      slot: started.slot,
      guess: answer,
    });
    expect(hit).toMatchObject({ solved: true, roundOver: true, won: true, answer });

    const series = await getSeries(t, "classic");
    expect(series.rounds[0]).toMatchObject({ status: "won", rawGuesses: 2 });
    const stats = await player.as.query(api.stats.getMyStats, {});
    expect(stats).toMatchObject({ classic_played: 1, classic_won: 1 });

    await expect(
      player.as.mutation(api.soloRounds.submitGuess, { mode: "classic", slot: started.slot, guess: answer }),
    ).rejects.toThrow("Ranked round is not active");
  });

  it("resumes an unfinished round instead of starting another", async () => {
    const t = convexTest(schema, modules);
    const player = await createUser(t, "player");
    const first = await player.as.mutation(api.soloRounds.start, { mode: "hard" });
    const { targetWords } = await getSoloRound(t, "hard");
    await player.as.mutation(api.soloRounds.submitGuess, {
      mode: "hard",
      slot: first.slot,
      guess: wrongGuessFor(targetWords[0]),
    });

    const resumed = await player.as.mutation(api.soloRounds.start, { mode: "hard" });
    expect(resumed).toMatchObject({ slot: first.slot, resumed: true });
    expect(resumed.guesses).toHaveLength(1);

    const limits = await player.as.query(api.dailyLimits.getMyDailyRoundLimits, {});
    expect(limits.modes.hard).toMatchObject({ played: 1, inProgress: true });
  });

  it("hands out one hint per guess from the real answer", async () => {
    const t = convexTest(schema, modules);
    const player = await createUser(t, "player");
    const { slot } = await player.as.mutation(api.soloRounds.start, { mode: "classic" });
    const answer = (await getSoloRound(t, "classic")).targetWords[0];

    await expect(player.as.mutation(api.soloRounds.spendHint, { mode: "classic", slot })).rejects.toThrow(
      "Make your first guess to unlock hints!",
    );
    await player.as.mutation(api.soloRounds.submitGuess, { mode: "classic", slot, guess: wrongGuessFor(answer) });

    const hint = await player.as.mutation(api.soloRounds.spendHint, { mode: "classic", slot });
    expect(hint.kind).toBe("reveal");
    if (hint.kind === "reveal") {
      expect(hint.letter).toBe(answer[hint.position]);
    }
    await expect(player.as.mutation(api.soloRounds.spendHint, { mode: "classic", slot })).rejects.toThrow(
      "one hint per guess",
    );

    await player.as.mutation(api.soloRounds.submitGuess, { mode: "classic", slot, guess: answer });
    expect((await getSeries(t, "classic")).rounds[0]).toMatchObject({ hintUses: 1, adjustedScore: 3 });
  });

  it("runs the timed clock on the server", async () => {
    const t = convexTest(schema, modules);
    const player = await createUser(t, "player");
    const { slot, msRemaining } = await player.as.mutation(api.soloRounds.start, { mode: "timed" });
    expect(msRemaining).toBe(75_000);
    const round = await getSoloRound(t, "timed");

    const solve = await player.as.mutation(api.soloRounds.submitGuess, {
      mode: "timed",
      slot,
      guess: round.targetWords[0],
    });
    expect(solve).toMatchObject({ solved: true, wordsCompleted: 1, msRemaining: 100_000 });

    // The player walks away; the scheduled expiry settles the round.
    vi.setSystemTime(Date.now() + 103_000);
    await t.mutation(internal.soloRounds.expireTimedRound, { roundId: round._id });

    expect((await getSoloRound(t, "timed")).status).toBe("finished");
    expect((await getSeries(t, "timed")).rounds[0]).toMatchObject({ status: "won", wordsCompleted: 1 });
  });
});

describe("games list", () => {
  it("shows a player's newest games, not their oldest", async () => {
    const t = convexTest(schema, modules);
    const host = await createUser(t, "host");
    await t.run(async (ctx) => {
      for (let i = 0; i < 25; i += 1) {
        await ctx.db.insert("games", {
          player1Id: host.userId,
          status: "finished",
          gameType: "multiplayer",
        });
      }
    });
    const gameId = await host.as.mutation(api.games.createGame, { gameType: "multiplayer" });

    const games = await host.as.query(api.games.getMyGames, {});
    expect(games.map((game) => game._id)).toContain(gameId);
  });
});

describe("analytics counters", () => {
  it("keeps one row per counter key", async () => {
    const t = convexTest(schema, modules);
    const alice = await createUser(t, "alice");
    const bob = await createUser(t, "bob");
    await alice.as.mutation(api.games.createGame, { gameType: "multiplayer" });
    await alice.as.mutation(api.games.createGame, { gameType: "multiplayer" });
    await bob.as.mutation(api.games.createGame, { gameType: "multiplayer" });
    // Site-wide counters are updated by scheduled mutations.
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const counters = await t.run(async (ctx) =>
      ctx.db
        .query("analyticsCounters")
        .withIndex("by_metric", (q) => q.eq("metric", "games_created"))
        .collect(),
    );
    const valueOf = (userId?: Id<"users">, dayKey?: string) =>
      counters
        .filter((counter) => counter.userId === userId && counter.dayKey === dayKey)
        .map((counter) => counter.value);

    expect(valueOf()).toEqual([3]);
    expect(valueOf(undefined, "2026-05-01")).toEqual([3]);
    expect(valueOf(alice.userId)).toEqual([2]);
    expect(valueOf(alice.userId, "2026-05-01")).toEqual([2]);
    expect(valueOf(bob.userId)).toEqual([1]);
  });
});

describe("friend search", () => {
  it("finds users beyond the first 200 accounts", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 210; i += 1) {
        await ctx.db.insert("users", { username: `filler${i}` });
      }
    });
    await createUser(t, "zebracorn");
    const searcher = await createUser(t, "searcher");

    const results = await searcher.as.query(api.friends.searchUsers, { searchQuery: "zebra" });
    expect(results.map((result) => result.username)).toContain("zebracorn");
  });
});

describe("username reservations", () => {
  it("holds a pending signup's username, then releases it once stale", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => reserveUsername(ctx.db, "racer"));

    await expect(t.run(async (ctx) => reserveUsername(ctx.db, "racer"))).rejects.toThrow(
      "Username is already taken",
    );

    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    await t.run(async (ctx) => reserveUsername(ctx.db, "racer"));
    const claims = await t.run(async (ctx) => ctx.db.query("usernameClaims").collect());
    expect(claims).toHaveLength(1);
  });
});

describe("leaving games", () => {
  it("forfeits a live game instead of deleting it for everyone", async () => {
    const t = convexTest(schema, modules);
    const { host, guest, gameId } = await startTwoPlayerLobby(t);
    await host.as.mutation(api.games.startGame, { gameId });

    await expect(host.as.mutation(api.games.deleteGame, { gameId })).rejects.toThrow(
      "Only the host can delete a game that hasn't started.",
    );

    await guest.as.mutation(api.games.leaveGame, { gameId });
    const game = await host.as.query(api.games.getGame, { gameId });
    expect(game).toMatchObject({ status: "finished", winnerId: host.userId });
    await expect(
      guest.as.mutation(api.guesses.submitGuess, { gameId, guess: "CRANE" }),
    ).rejects.toThrow("Game is not active");
  });

  it("lets other players leave a lobby, and only the host delete it", async () => {
    const t = convexTest(schema, modules);
    const { host, guest, gameId } = await startTwoPlayerLobby(t);

    await expect(guest.as.mutation(api.games.deleteGame, { gameId })).rejects.toThrow(
      "Only the host can delete",
    );
    await guest.as.mutation(api.games.leaveGame, { gameId });
    expect((await host.as.query(api.games.getGame, { gameId }))!.playerCount).toBe(1);

    await host.as.mutation(api.games.deleteGame, { gameId });
    expect(await t.run(async (ctx) => ctx.db.get(gameId))).toBeNull();
  });

  it("rejects multiplayer guesses that aren't words", async () => {
    const t = convexTest(schema, modules);
    const { host, gameId } = await startTwoPlayerLobby(t);
    await host.as.mutation(api.games.startGame, { gameId });
    await expect(
      host.as.mutation(api.guesses.submitGuess, { gameId, guess: "QQQQQ" }),
    ).rejects.toThrow("Not in word list");
  });
});

describe("timeouts", () => {
  it("spends a challenge turn when its clock runs out", async () => {
    const t = convexTest(schema, modules);
    const { host, friend, gameId } = await startChallenge(t);
    const { turnDeadline } = (await t.run(async (ctx) => ctx.db.get(gameId)))!;
    expect(turnDeadline).toBeGreaterThan(Date.now());

    vi.setSystemTime(turnDeadline! + 3_000);
    await t.mutation(internal.games.enforceTurnTimeout, { gameId, turnDeadline: turnDeadline! });

    const hostView = await host.as.query(api.guesses.getGuesses, { gameId });
    expect(hostView).toMatchObject([{ playerId: host.userId, guess: "" }]);
    // It's now the friend's turn.
    await friend.as.mutation(api.guesses.submitGuess, { gameId, guess: "CRANE" });

    // A stale timeout (a guess was made in time) does nothing.
    await t.mutation(internal.games.enforceTurnTimeout, { gameId, turnDeadline: turnDeadline! });
    expect(await host.as.query(api.guesses.getGuesses, { gameId })).toHaveLength(2);
  });

  it("forfeits players who stop guessing in a simultaneous game", async () => {
    const t = convexTest(schema, modules);
    const { host, guest, gameId } = await startTwoPlayerLobby(t);
    await host.as.mutation(api.games.startGame, { gameId });
    await setTargetWord(t, gameId, "APPLE");

    vi.setSystemTime(Date.now() + 60_000);
    await guest.as.mutation(api.guesses.submitGuess, { gameId, guess: "CRANE" });

    vi.setSystemTime(Date.now() + 2 * 60_000 + 1_000);
    await t.mutation(internal.games.forfeitIdlePlayers, { gameId });

    const game = await guest.as.query(api.games.getGame, { gameId });
    expect(game).toMatchObject({ status: "finished", winnerId: guest.userId });
    expect(game!.forfeitedPlayerIds).toEqual([host.userId]);
  });
});

describe("case-insensitive usernames", () => {
  it("treats usernames that differ only in case as taken", async () => {
    const t = convexTest(schema, modules);
    const alice = await createUser(t, "Alice");
    await t.run(async (ctx) => reserveUsername(ctx.db, "Alice", alice.userId));

    await expect(t.run(async (ctx) => reserveUsername(ctx.db, "alice"))).rejects.toThrow(
      "Username is already taken",
    );
  });

  it("backfills older claims and clears abandoned reservations", async () => {
    const t = convexTest(schema, modules);
    const bob = await createUser(t, "Bob");
    await t.run(async (ctx) => {
      await ctx.db.insert("usernameClaims", { username: "Bob", userId: bob.userId });
      await ctx.db.insert("usernameClaims", { username: "ghost" });
    });

    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    await t.mutation(internal.usernames.maintainUsernameRegistry, {});

    const claims = await t.run(async (ctx) => ctx.db.query("usernameClaims").collect());
    expect(claims).toMatchObject([{ username: "Bob", usernameLower: "bob" }]);
    await expect(t.run(async (ctx) => reserveUsername(ctx.db, "BOB"))).rejects.toThrow(
      "Username is already taken",
    );
  });
});
