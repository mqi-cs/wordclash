import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { MultiplayerGame } from "./MultiplayerGame";
import * as authContext from "@/contexts/AuthContext";

const mockNavigate = vi.fn();
const mockCreateGame = vi.fn();
const mockJoinGame = vi.fn();
const mockJoinGameByCode = vi.fn();
const mockStartGame = vi.fn();
const mockSubmitGuess = vi.fn();
const mockUseAuth = vi.mocked(authContext.useAuth);
const mockUseQuery = vi.mocked(useQuery);
const mockUseMutation = vi.mocked(useMutation);

type QueryCall = {
  ref: unknown;
  args: unknown;
};

let queryCalls: QueryCall[] = [];

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/components/GameGrid", () => ({
  GameGrid: () => <div data-testid="game-grid" />,
}));

vi.mock("@/components/Keyboard", () => ({
  Keyboard: () => <div data-testid="keyboard" />,
}));

const waitingMultiplayerGame = {
  _id: "game-123",
  player1Id: "user-1",
  status: "waiting",
  gameType: "multiplayer",
  playerCount: 1,
  players: [
    {
      id: "user-1",
      username: "Host",
      isHost: true,
    },
  ],
  lobbyCode: "ABC123",
};

const setup = () => {
  queryCalls = [];

  mockUseAuth.mockReturnValue({
    user: { id: "user-1", username: "Host" },
    loading: false,
  } as unknown as ReturnType<typeof authContext.useAuth>);

  mockUseMutation
    .mockReturnValueOnce(mockCreateGame as never)
    .mockReturnValueOnce(mockJoinGame as never)
    .mockReturnValueOnce(mockJoinGameByCode as never)
    .mockReturnValueOnce(mockStartGame as never)
    .mockReturnValueOnce(mockSubmitGuess as never);

  mockUseQuery.mockImplementation((query, args) => {
    queryCalls.push({ ref: query, args });

    if (query === api.games.getGame) {
      return args === "skip" ? undefined : waitingMultiplayerGame;
    }

    if (query === api.guesses.getGuesses) {
      return [];
    }

    if (query === api.games.getTargetWord) {
      return null;
    }

    return undefined;
  });

  return render(<MultiplayerGame onBackToMenu={vi.fn()} />);
};

describe("MultiplayerGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCalls = [];
    mockCreateGame.mockResolvedValue("game-123");
    mockJoinGame.mockResolvedValue("game-123");
    mockJoinGameByCode.mockResolvedValue("game-123");
    mockStartGame.mockResolvedValue("game-123");
    mockSubmitGuess.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(),
      },
    });
  });

  it("joins a requested multiplayer game by id from the URL", async () => {
    window.history.replaceState({}, "", "/?mode=multiplayer&game=game-123");
    setup();

    await waitFor(() => {
      expect(mockJoinGame).toHaveBeenCalledWith({ gameId: "game-123" });
    });
  });

  it("joins a lobby by normalized code from the URL", async () => {
    window.history.replaceState({}, "", "/?mode=multiplayer&join=ab12cd");
    setup();

    await waitFor(() => {
      expect(mockJoinGameByCode).toHaveBeenCalledWith({ lobbyCode: "AB12CD" });
    });
  });

  it("skips guessing data while a multiplayer lobby is still waiting", async () => {
    window.history.replaceState({}, "", "/?mode=multiplayer&game=game-123");
    setup();

    await waitFor(() => {
      expect(mockJoinGame).toHaveBeenCalledWith({ gameId: "game-123" });
    });

    const guessQueryCalls = queryCalls.filter((_, index) => index % 3 === 1);
    expect(guessQueryCalls.length).toBeGreaterThan(0);
    expect(guessQueryCalls.every((call) => call.args === "skip")).toBe(true);
  });
});
