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
const mockDeleteGame = vi.fn();
const mockCaptureUserEvent = vi.fn();
const mockHeartbeatPresence = vi.fn();
const mockStartRandomMatchmaking = vi.fn();
const mockAcceptRandomMatchmaking = vi.fn();
const mockDeclineRandomMatchmaking = vi.fn();
const mockCancelRandomMatchmaking = vi.fn();
const mockFinalizeRandomMatchmakingFallback = vi.fn();
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

vi.mock("@/contexts/PostHogContext", () => ({
  usePostHog: () => ({
    trackGame: vi.fn(),
  }),
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

  mockUseMutation.mockImplementation(() => {
    const mutation = ((args: Record<string, unknown>) => {
      if ("lobbyCode" in args) {
        return mockJoinGameByCode(args);
      }
      if ("guess" in args) {
        return mockSubmitGuess(args);
      }
      if ("availableForRandomMatch" in args) {
        return mockHeartbeatPresence(args);
      }
      if ("matchmakingId" in args) {
        return mockCancelRandomMatchmaking(args);
      }
      if ("gameType" in args) {
        return mockCreateGame(args);
      }
      if ("event" in args) {
        return mockCaptureUserEvent(args);
      }
      if ("gameId" in args) {
        return mockJoinGame(args);
      }
      return Promise.resolve({ success: true });
    }) as ReturnType<typeof useMutation>;

    mutation.withOptimisticUpdate = vi.fn(() => mutation);
    return mutation;
  });

  mockUseQuery.mockImplementation((query, args) => {
    queryCalls.push({ ref: query, args });

    if (args === "skip") {
      return undefined;
    }

    if (args && typeof args === "object" && "gameId" in args) {
      return waitingMultiplayerGame;
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
    mockDeleteGame.mockResolvedValue({ success: true });
    mockCaptureUserEvent.mockResolvedValue(undefined);
    mockHeartbeatPresence.mockResolvedValue({ success: true });
    mockStartRandomMatchmaking.mockResolvedValue({ matchmakingId: "match-1", status: "searching" });
    mockAcceptRandomMatchmaking.mockResolvedValue({ gameId: "game-123" });
    mockDeclineRandomMatchmaking.mockResolvedValue({ success: true });
    mockCancelRandomMatchmaking.mockResolvedValue({ success: true });
    mockFinalizeRandomMatchmakingFallback.mockResolvedValue({
      status: "bot_fallback",
      gameId: null,
      opponentDisplayName: "NovaFox27",
    });
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

    expect(queryCalls.some((call) => call.args === "skip")).toBe(true);
  });
});
