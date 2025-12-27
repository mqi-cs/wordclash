import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import Index from '../pages/Index';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import * as wordListModule from '../lib/wordList';
import * as gameHistoryModule from '../lib/gameHistory';

// Mock dependencies
vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: null }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('../hooks/useStatsUpdate', () => ({
    useStatsUpdate: () => ({ updateStats: vi.fn() })
}));

describe('Timed Mode', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Mock random word to be predictable
        vi.spyOn(wordListModule, 'getRandomWord').mockReturnValue('TESTS');
        vi.spyOn(wordListModule, 'isValidWord').mockReturnValue(true);
        // Mock game history save
        vi.spyOn(gameHistoryModule, 'saveGameResult').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    const renderGame = () => {
        return render(
            <BrowserRouter>
                <Index />
            </BrowserRouter>
        );
    };

    const startTimedMode = async () => {
        renderGame();
        const timedButton = screen.getByText("Start Timed");
        fireEvent.click(timedButton);
        // Wait for state update - should be sync/handled by RTL
        expect(screen.getByText('1:30')).toBeInTheDocument();
    };

    const typeWord = (word: string) => {
        act(() => {
            for (const char of word) {
                fireEvent.keyDown(window, { key: char });
            }
        });
    };

    const submitGuess = () => {
        act(() => {
            fireEvent.keyDown(window, { key: 'Enter' });
        });
    };

    it('starts with 90 seconds and 0 words calculated', async () => {
        await startTimedMode();

        // Check initial state in header
        expect(screen.getByText('1:30')).toBeInTheDocument(); // 90 seconds formatted
        expect(screen.getByText('0 words')).toBeInTheDocument();

        // Check timer counts down
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.getByText('1:29')).toBeInTheDocument();
    });

    it('increments total guesses but allows unlimited guesses', async () => {
        await startTimedMode();

        // Make a wrong guess
        typeWord('WRONG');
        submitGuess();

        expect(screen.getByText('1 guesses')).toBeInTheDocument();

        // Make 6 more guesses (total 7) - in classic this would end game, in timed it shouldn't
        for (let i = 0; i < 6; i++) {
            typeWord('WRONG');
            submitGuess();
        }

        expect(screen.getByText('7 guesses')).toBeInTheDocument();
        expect(screen.queryByText(/The word was/i)).not.toBeInTheDocument(); // Should not lose
    });

    it('awards bonus time and increments word count on correct guess', async () => {
        await startTimedMode();

        // Advance time a bit (e.g., 10s passed, 80s left)
        act(() => {
            vi.advanceTimersByTime(10000);
        });

        // Correct guess
        typeWord('TESTS');
        submitGuess();

        // Should show +30s toast (mocked implicitly via sonner mock but we check state)
        // 80s left + 30s bonus = 110s
        expect(screen.getByText('1 words')).toBeInTheDocument();
        // The component logic: setTimeLeft(prev => prev + 30)
        // Previous was 80. So 110.
        // Format: 110/60 = 1:50
        expect(screen.getByText('1:50')).toBeInTheDocument();
    });

    it('resets board for next word after correct guess', async () => {
        await startTimedMode();
        typeWord('TESTS');
        submitGuess();

        // There is a timeout of 1000ms before reset
        act(() => {
            vi.advanceTimersByTime(1000);
        });

        // Grid should be empty of guesses (or at least previous guesses cleared)
        // We can check if the "WRONG" text from a previous hypothetical guess is gone,
        // or just check that we can type efficiently again.
        // The component sets guesses to [].

        // Let's verify we can guess again and it counts as word 2
        // Mock next word
        vi.spyOn(wordListModule, 'getRandomWord').mockReturnValue('NEXTS');

        typeWord('NEXTS');
        submitGuess();

        expect(screen.getByText('2 words')).toBeInTheDocument();
    });

    it('ends game when time runs out', async () => {
        await startTimedMode();

        // Fast forward 90 seconds
        act(() => {
            vi.advanceTimersByTime(90000);
        });

        // Should show result modal
        expect(screen.getByText("Time's up!")).toBeInTheDocument();

        // Check if result was saved
        expect(gameHistoryModule.saveGameResult).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'timed',
                won: false, // 0 words completed
                guesses: 0,
                wordsCompleted: 0
            })
        );
    });

    it('saves correct stats when time runs out after some wins', async () => {
        await startTimedMode();

        // Win one
        typeWord('TESTS');
        submitGuess();

        act(() => {
            vi.advanceTimersByTime(1000); // Wait for reset
        });

        // Now let time run out (we have extra time now, 90 - 0 (instant guess) + 30 = 120s)
        act(() => {
            vi.advanceTimersByTime(120000);
        });

        expect(gameHistoryModule.saveGameResult).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'timed',
                won: true, // played > 0 words
                wordsCompleted: 1
            })
        );
    });
});
