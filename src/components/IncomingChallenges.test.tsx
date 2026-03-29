import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { IncomingChallenges } from "./IncomingChallenges";
import * as authContext from "@/contexts/AuthContext";
import { toast } from "sonner";

const mockNavigate = vi.fn();
const mockAcceptInvitation = vi.fn();
const mockDeclineInvitation = vi.fn();
const mockUseAuth = vi.mocked(authContext.useAuth);
const mockUseQuery = vi.mocked(useQuery);
const mockUseMutation = vi.mocked(useMutation);

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const invitation = {
  _id: "invite-1",
  gameId: "game-1",
  fromUserId: "user-2",
  toUserId: "user-1",
  status: "pending",
  senderUsername: "Rival",
};

const setup = () => {
  mockUseAuth.mockReturnValue({
    user: { id: "user-1", username: "Host" },
  } as unknown as ReturnType<typeof authContext.useAuth>);

  mockUseQuery.mockReturnValue([invitation] as never);
  mockUseMutation
    .mockReturnValueOnce(mockAcceptInvitation as never)
    .mockReturnValueOnce(mockDeclineInvitation as never);

  render(<IncomingChallenges />);
};

describe("IncomingChallenges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcceptInvitation.mockResolvedValue("game-1");
    mockDeclineInvitation.mockResolvedValue({ success: true });
  });

  it("accepts a challenge and navigates into the game", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "Accept & Play" }));

    await waitFor(() => {
      expect(mockAcceptInvitation).toHaveBeenCalledWith({ invitationId: "invite-1" });
    });
    expect(toast.success).toHaveBeenCalledWith("Challenge accepted!");
    expect(mockNavigate).toHaveBeenCalledWith("/?join=game-1&mode=multiplayer");
  });

  it("declines a challenge without affecting the accept flow", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => {
      expect(mockDeclineInvitation).toHaveBeenCalledWith({ invitationId: "invite-1" });
    });
    expect(toast.success).toHaveBeenCalledWith("Challenge declined");
    expect(mockAcceptInvitation).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
