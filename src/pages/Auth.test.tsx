import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "./Auth";
import * as authContext from "@/contexts/AuthContext";

const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockUseAuth = vi.mocked(authContext.useAuth);

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const setup = () => {
  mockUseAuth.mockReturnValue({
    signIn: mockSignIn,
    signUp: mockSignUp,
  } as ReturnType<typeof authContext.useAuth>);

  render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
};

describe("Auth page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_ENABLE_GOOGLE_AUTH", "false");
    mockSignIn.mockResolvedValue({ error: null });
    mockSignUp.mockResolvedValue({ error: null });
  });

  it("normalizes sign in email before submitting", async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText("Email"), "  TEST@Example.COM  ");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "password123");
    });
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("normalizes sign up email and username before submitting", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "Don't have an account? Sign Up" }));
    await user.type(screen.getByLabelText("Username"), "  New_User  ");
    await user.type(screen.getByLabelText("Email"), "  TEST@Example.COM  ");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith("test@example.com", "password123", "New_User");
    });
  });
});
