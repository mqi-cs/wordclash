import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Index from "./Index";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import * as wordList from "@/lib/wordList";
import * as authContext from "@/contexts/AuthContext";
import { toast } from "sonner";

// Mock dependencies
vi.mock("@/lib/wordList", async () => {
    const actual = await vi.importActual<typeof import("@/lib/wordList")>("@/lib/wordList");
    return {
        ...actual,
        getRandomWord: vi.fn(),
        isValidWord: vi.fn(),
    };
});

vi.mock("@/contexts/AuthContext", () => ({
    useAuth: vi.fn(),
}));

// A minimal stand-in for the soloRounds API, so signed-in games (which the
// server scores) can be played against the same answer as guest games.
const fakeSoloServer = vi.hoisted(() => {
    const state = { guesses: [] as string[], hintTurn: -1 };
    const answer = "APPLE";
    const evaluate = (guess: string) =>
        guess.split("").map((letter, i) =>
            letter === answer[i] ? "correct" : answer.includes(letter) ? "present" : "absent",
        );
    return {
        reset: () => {
            state.guesses = [];
            state.hintTurn = -1;
        },
        handlers: {
            "soloRounds:start": async () => ({
                slot: 1,
                resumed: false,
                guesses: [],
                totalGuesses: 0,
                wordsCompleted: 0,
                hintUses: 0,
                eliminatedLetters: [],
                msRemaining: null,
            }),
            "soloRounds:submitGuess": async ({ guess }: { guess: string }) => {
                state.guesses.push(guess);
                const solved = guess === answer;
                const roundOver = solved || state.guesses.length >= 6;
                return {
                    evaluation: evaluate(guess),
                    solved,
                    roundOver,
                    won: solved,
                    answer: roundOver ? answer : null,
                    wordsCompleted: 0,
                    msRemaining: null,
                };
            },
            "soloRounds:spendHint": async () => {
                if (state.hintTurn === state.guesses.length) {
                    throw new Error("You can only use one hint per guess! Make another guess first.");
                }
                state.hintTurn = state.guesses.length;
                return { kind: "reveal", position: 0, letter: answer[0], msRemaining: null };
            },
        } as Record<string, (args: never) => Promise<unknown>>,
    };
});

vi.mock("convex/react", async () => {
    const { getFunctionName } = await vi.importActual<typeof import("convex/server")>("convex/server");
    return {
        useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
            vi.fn(fakeSoloServer.handlers[getFunctionName(reference)] ?? (async () => null)),
        useQuery: () => undefined,
    };
});

vi.mock("@/contexts/PostHogContext", () => ({
    usePostHog: () => ({
        trackGame: vi.fn(),
    }),
}));

vi.mock("@/components/OpenGames", () => ({ OpenGames: () => <div>Mock OpenGames</div> }));
vi.mock("@/components/IncomingChallenges", () => ({ IncomingChallenges: () => <div>Mock IncomingChallenges</div> }));
vi.mock("@/components/FriendRequests", () => ({ FriendRequests: () => <div>Mock FriendRequests</div> }));
vi.mock("@/components/FriendSearch", () => ({ FriendSearch: () => <div>Mock FriendSearch</div> }));
vi.mock("@/components/FriendsList", () => ({ FriendsList: () => <div>Mock FriendsList</div> }));
vi.mock("@/components/UserStats", () => ({ UserStats: () => <div>Mock UserStats</div> }));

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
        useNavigate: () => vi.fn(),
    }
});

// Helper to setup the test environment
const setup = (signedIn: boolean) => {
    // Mock random word to always be "APPLE"
    vi.mocked(wordList.getRandomWord).mockReturnValue("APPLE");
    // Mock valid word check to always return true for "APPLE" and some others
    vi.mocked(wordList.isValidWord).mockImplementation((word) => ["APPLE", "GUESS", "WRONG", "ABCDE"].includes(word));

    // Mock Auth User
    vi.mocked(authContext.useAuth).mockReturnValue({
        user: signedIn ? { id: "test-user", username: "tester" } : null,
        signOut: vi.fn(),
    } as unknown as ReturnType<typeof authContext.useAuth>);

    const user = userEvent.setup();
    const view = render(<Index />);

    return { user, ...view };
};

// Guests play locally; signed-in players play against the server.
describe.each([
    ["as a guest", false],
    ["signed in", true],
])("Classic Mode (%s)", (_label, signedIn) => {
    beforeEach(() => {
        vi.clearAllMocks();
        fakeSoloServer.reset();
        // Guest rounds and daily limits live in localStorage.
        localStorage.clear();
    });

    const enterGame = async (user: ReturnType<typeof userEvent.setup>) => {
        const startButton = screen.getByText("Start Classic");
        await user.click(startButton);
    }

    it("starts in Classic Mode", async () => {
        const { user } = setup(signedIn);
        await enterGame(user);

        expect(screen.getByText(/Classic Mode/i)).toBeInTheDocument();
    });

    it("allows user to type and submit a correct word (Positive Test)", async () => {
        const { user } = setup(signedIn);
        await enterGame(user);

        // Type "APPLE"
        fireEvent.keyDown(window, { key: "A" });
        fireEvent.keyDown(window, { key: "P" });
        fireEvent.keyDown(window, { key: "P" });
        fireEvent.keyDown(window, { key: "L" });
        fireEvent.keyDown(window, { key: "E" });

        // Press Enter
        fireEvent.keyDown(window, { key: "Enter" });

        // Expect Success Message via spy
        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith("Congratulations! 🎉");
        }, { timeout: 3000 });
    });

    it("handles invalid words (Edge Scenario)", async () => {
        const { user } = setup(signedIn);
        await enterGame(user);

        // Type "ZZZZZ" (invalid)
        fireEvent.keyDown(window, { key: "Z" });
        fireEvent.keyDown(window, { key: "Z" });
        fireEvent.keyDown(window, { key: "Z" });
        fireEvent.keyDown(window, { key: "Z" });
        fireEvent.keyDown(window, { key: "Z" });

        fireEvent.keyDown(window, { key: "Enter" });

        expect(toast.error).toHaveBeenCalledWith("Not in word list");
    });

    it("handles not enough letters (Edge Scenario)", async () => {
        const { user } = setup(signedIn);
        await enterGame(user);

        // Type "APP"
        fireEvent.keyDown(window, { key: "A" });
        fireEvent.keyDown(window, { key: "P" });
        fireEvent.keyDown(window, { key: "P" });

        fireEvent.keyDown(window, { key: "Enter" });

        expect(toast.error).toHaveBeenCalledWith("Not enough letters");
    });

    it("reveals hints correctly", async () => {
        // Hints are enabled after first guess in Classic
        const { user } = setup(signedIn);
        await enterGame(user);

        // Make one wrong guess to enable hints
        // Target is APPLE
        // Guess GUESS
        const guess = "GUESS";
        for (const char of guess) {
            fireEvent.keyDown(window, { key: char });
        }
        fireEvent.keyDown(window, { key: "Enter" });

        await waitFor(() => {
            expect(screen.getByText("1")).toBeInTheDocument(); // Badge showing 1 hint available
        }, { timeout: 2000 });
    });

    it("resets hint state after a guess is submitted", async () => {
        const { user, container } = setup(signedIn);
        await enterGame(user);

        vi.spyOn(Math, "random").mockReturnValue(0);

        for (const char of "GUESS") {
            fireEvent.keyDown(window, { key: char });
        }
        fireEvent.keyDown(window, { key: "Enter" });

        const hintButton = screen.getAllByRole("button").find((button) =>
            button.querySelector("svg.lucide-lightbulb")
        );
        expect(hintButton).toBeDefined();

        await user.click(hintButton!);

        await waitFor(() => {
            expect(container.querySelector(".hint-tile")).toBeInTheDocument();
        });

        for (const char of "ABCDE") {
            fireEvent.keyDown(window, { key: char });
        }
        fireEvent.keyDown(window, { key: "Enter" });

        await waitFor(() => {
            expect(container.querySelector(".hint-tile")).not.toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText("1")).toBeInTheDocument();
        });
    });

    it("loses the game after 6 incorrect guesses (Negative Test)", async () => {
        const { user } = setup(signedIn);
        await enterGame(user);

        // Target is APPLE
        // Guess WRONG 6 times
        const guess = "WRONG";
        for (let i = 0; i < 6; i++) {
            for (const char of guess) {
                fireEvent.keyDown(window, { key: char });
            }
            // Let each guess settle: signed-in guesses wait on the server.
            await act(async () => {
                fireEvent.keyDown(window, { key: "Enter" });
            });
        }

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("The word was APPLE"));
        }, { timeout: 3000 });
    });
});
