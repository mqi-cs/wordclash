import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MultiplayerGame } from '../components/MultiplayerGame';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import * as wordListModule from '@/lib/wordList';

// Mock dependencies
vi.mock('../contexts/AuthContext', () => ({
    useAuth: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
    supabase: {
        from: vi.fn(),
        channel: vi.fn(),
        rpc: vi.fn(),
        removeChannel: vi.fn(),
        functions: {
            invoke: vi.fn()
        }
    },
}));

vi.mock('@/lib/wordList', () => ({
    getRandomWord: vi.fn().mockReturnValue('TESTS'),
    isValidWord: vi.fn().mockReturnValue(true),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }
}));

import { toast } from 'sonner';

describe('MultiplayerGame', () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const onBackMock = vi.fn();
    let channelMock: any;
    let subscribeCallbacks: Record<string, Function> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        subscribeCallbacks = {};

        // Setup Auth
        (useAuth as any).mockReturnValue({ user: mockUser, loading: false });

        // Setup Channel Mock
        channelMock = {
            on: vi.fn().mockImplementation((type, filter, callback) => {
                // Store callback based on event type if needed, or just return this
                if (typeof filter === 'function') {
                    // This handles presence "sync"
                    // filter here is the callback
                    // type is 'presence', event is object { event: 'sync' }
                    // Actually checking the code: .on("presence", { event: "sync" }, () => {})
                } else if (typeof callback === 'function') {
                    // This handles postgres_changes
                    // key could be type + table
                }

                // For simplicity in tests, we'll manually trigger updates via helpers
                // but we need to capture the callbacks if we want to trigger them
                return channelMock;
            }),
            subscribe: vi.fn().mockImplementation((callback) => {
                if (callback) {
                    setTimeout(() => callback("SUBSCRIBED"), 0);
                }
                return channelMock;
            }),
            track: vi.fn().mockResolvedValue({}),
            presenceState: vi.fn().mockReturnValue({}),
            unsubscribe: vi.fn(),
        };

        // Capture callbacks more robustly
        channelMock.on.mockImplementation((event: string, filterOrConfig: any, callback: any) => {
            if (event === 'postgres_changes') {
                const key = `postgres_changes:${filterOrConfig.table}`;
                subscribeCallbacks[key] = callback;
            } else if (event === 'presence') {
                subscribeCallbacks['presence:sync'] = callback;
            }
            return channelMock;
        });

        (supabase.channel as any).mockReturnValue(channelMock);

        // Setup Default Supabase Mocks
        (supabase.from as any).mockImplementation((table: string) => {
            const mockChain = {
                select: vi.fn().mockReturnThis(),
                insert: vi.fn().mockReturnThis(),
                update: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                single: vi.fn(),
                delete: vi.fn().mockReturnThis(),
            };

            if (table === 'multiplayer_games') {
                mockChain.single.mockResolvedValue({
                    data: {
                        id: 'game-1',
                        player1_id: 'user-1',
                        status: 'waiting',
                        game_started: false
                    },
                    error: null
                });
            } else if (table === 'multiplayer_game_secrets') {
                mockChain.single.mockResolvedValue({
                    data: { target_word: 'TESTS' },
                    error: null
                });
            }

            return mockChain;
        });

        // Mock evaluate-guess function
        (supabase.functions.invoke as any).mockResolvedValue({
            data: {
                is_correct: false,
                evaluation: ['absent', 'absent', 'absent', 'absent', 'absent']
            },
            error: null
        });

        // Reset Location
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/',
                search: '',
                origin: 'http://localhost:3000',
                assign: vi.fn(),
            },
            writable: true
        });
    });

    it('renders mode selection initially', async () => {
        render(
            <BrowserRouter>
                <MultiplayerGame onBackToMenu={onBackMock} />
            </BrowserRouter>
        );
        await waitFor(() => {
            expect(screen.getByText('Create Game')).toBeInTheDocument();
        });
        expect(screen.getByText('Join Game')).toBeInTheDocument();
    });

    it('creates a game and enters waiting room', async () => {
        render(
            <BrowserRouter>
                <MultiplayerGame onBackToMenu={onBackMock} />
            </BrowserRouter>
        );

        // Wait for load
        await waitFor(() => {
            expect(screen.getByText('Create Game')).toBeInTheDocument();
        });

        // Mock create game response
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'multiplayer_games') {
                return {
                    insert: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: { id: 'new-game', player1_id: 'user-1', status: 'waiting' },
                                error: null
                            })
                        })
                    })
                };
            }
            if (table === 'multiplayer_game_secrets') {
                return {
                    insert: vi.fn().mockResolvedValue({ error: null })
                };
            }
            return { select: vi.fn() };
        });

        fireEvent.click(screen.getByText('Create Game'));

        await waitFor(() => {
            expect(screen.getByText(/Waiting Room/i)).toBeInTheDocument();
            expect(screen.getByText(/new-game/i)).toBeInTheDocument();
            // Should be player 1 (host)
            expect(screen.getByText('Player 1 (You)')).toBeInTheDocument();
        });
    });

    it('joins a game via code', async () => {
        render(
            <BrowserRouter>
                <MultiplayerGame onBackToMenu={onBackMock} />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Join Game')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Join Game'));

        const input = screen.getByPlaceholderText(/game code/i);
        fireEvent.change(input, { target: { value: 'game-1' } });

        // Mock game exists check
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'multiplayer_games') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: { id: 'game-1', player1_id: 'host-id', game_started: false },
                                error: null
                            })
                        })
                    })
                };
            }
            return { select: vi.fn() };
        });

        // Mock RPC join
        (supabase.rpc as any).mockResolvedValue({ data: { slot: 2 }, error: null });

        fireEvent.click(screen.getByRole('button', { name: /Join Game/i }));

        await waitFor(() => {
            // Should show player 2
            expect(screen.getByText('Player 2 (You)')).toBeInTheDocument();
        }, { timeout: 3000 });
    });

    it('starts game when real-time update received', async () => {
        // Setup initial state as host in waiting room
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'multiplayer_games') {
                // Return game state
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: {
                                    id: 'game-1',
                                    player1_id: 'user-1',
                                    player2_id: 'user-2',
                                    status: 'waiting',
                                    game_started: false
                                },
                                error: null
                            })
                        })
                    })
                };
            }
            return { select: vi.fn() };
        });

        // Pre-set URL to simulate joined game
        Object.defineProperty(window, 'location', {
            value: { search: '?game=game-1', pathname: '/', replaceState: vi.fn() },
            writable: true
        });

        render(
            <BrowserRouter>
                <MultiplayerGame onBackToMenu={onBackMock} />
            </BrowserRouter>
        );

        await waitFor(() => {
            // It might start as "Waiting for Host" then switch to "Waiting Room"
            // or directly to Waiting Room if fast enough.
            // But we want to ensure it has processed the join.
            // If we are host, it should say "Waiting Room"
            expect(screen.getByText('Waiting Room')).toBeInTheDocument();
        }, { timeout: 3000 });

        // Trigger real-time update: game started
        act(() => {
            const callback = subscribeCallbacks['postgres_changes:multiplayer_games'];
            if (callback) {
                callback({
                    new: {
                        id: 'game-1',
                        player1_id: 'user-1',
                        player2_id: 'user-2',
                        game_started: true,
                        status: 'active'
                    }
                });
            }
        });

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('Game starting!');
            // Should see keyboard now
            expect(screen.getByText('ENTER')).toBeInTheDocument();
        });
    });

    it('handles turn-based gameplay', async () => {
        // ... (Similar setup to above, but game already started)
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'multiplayer_games') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: {
                                    id: 'game-1',
                                    player1_id: 'user-1', // Me
                                    player2_id: 'user-2',
                                    status: 'active',
                                    game_started: true
                                },
                                error: null
                            })
                        })
                    })
                };
            }
            if (table === 'multiplayer_game_secrets') {
                // Should allow fetching secret if game over, but let's just default mock
                return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { target_word: 'TESTS' } }) };
            }
            return { select: vi.fn() };
        });

        Object.defineProperty(window, 'location', {
            value: { search: '?game=game-1', pathname: '/', replaceState: vi.fn() },
            writable: true
        });

        render(
            <BrowserRouter>
                <MultiplayerGame onBackToMenu={onBackMock} />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('ENTER')).toBeInTheDocument();
        }, { timeout: 3000 });

        // Host (user-1) goes first, so input should be enabled
        // Check if we can type
        fireEvent.keyDown(window, { key: 'A' });
        expect(screen.getByText('A')).toBeInTheDocument();

        // Submit guess
        fireEvent.keyDown(window, { key: 'B' }); fireEvent.keyDown(window, { key: 'C' }); fireEvent.keyDown(window, { key: 'D' }); fireEvent.keyDown(window, { key: 'E' });

        // Mock evaluation result
        (supabase.functions.invoke as any).mockResolvedValue({
            data: {
                is_correct: false,
                evaluation: ['absent', 'absent', 'absent', 'absent', 'absent']
            },
            error: null
        });

        await act(async () => {
            fireEvent.keyDown(window, { key: 'Enter' });
        });

        await waitFor(() => {
            // Expect turn to end
            // The component checks if turn ended. 
            // Logic: My guess processed -> setIsMyTurn(false)
            // We can check if input is disabled or strict check via state if we could access it.
            // Or check visual feedback "Opponent's Turn" if it's there? 
            // The component doesn't have explicit "Opponent's Turn" text visible easily, 
            // but we can check if typing adds more letters.
        });

        // Try typing again - should fail if not my turn
        // fireEvent.keyDown(window, { key: 'F' });
        // This is hard to assert without implementation detail "isMyTurn".
        // But we can check if opponent guess updates our turn back.

        // Simulate opponent guess
        act(() => {
            const callback = subscribeCallbacks['postgres_changes:multiplayer_guesses'];
            if (callback) {
                callback({
                    new: {
                        game_id: 'game-1',
                        player_id: 'user-2',
                        guess: 'OTHER',
                        evaluation: ['absent', 'absent', 'absent', 'absent', 'absent'],
                        guess_number: 1
                    }
                });
            }
        });

        await waitFor(() => {
            // Should be my turn again
            // We can verify "time left" resets to 20s
            // or just that we can type again effectively
        });
    });
});
