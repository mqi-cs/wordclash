// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex as ConvexTestInstance } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
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

describe("leaderboards", () => {
  it("clamps impossible client-reported guess counts", async () => {
    const t = convexTest(schema, modules);
    const player = await createUser(t, "player");
    const { slot } = await player.as.mutation(api.leaderboards.startSoloRound, { mode: "classic" });
    await player.as.mutation(api.leaderboards.finishSoloRound, {
      mode: "classic",
      slot,
      won: true,
      greenLetters: 5,
      rawGuesses: -50,
      hintUses: -3,
    });

    const series = await t.run(async (ctx) => ctx.db.query("leaderboardSeries").first());
    expect(series!.rounds[0]).toMatchObject({ status: "won", rawGuesses: 1, hintUses: 0 });
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
