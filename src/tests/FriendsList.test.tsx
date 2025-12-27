import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FriendsList } from '../components/FriendsList';
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
    },
}));

vi.mock('@/lib/wordList', () => ({
    getRandomWord: vi.fn().mockReturnValue('TESTS'),
}));

// Mock sonner
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    }
}));

import { toast } from 'sonner';

describe('FriendsList', () => {
    const mockUser = { id: 'user-1' };

    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({ user: mockUser });

        // Default mock setup using mockImplementation to route based on table
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'friendships') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            or: vi.fn().mockResolvedValue({ data: [], error: null })
                        })
                    })
                };
            }
            return {
                select: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({ data: [], error: null })
                })
            };
        });
    });

    it('renders empty state when no friends', async () => {
        render(<FriendsList />);
        await waitFor(() => {
            expect(screen.getByText(/No friends yet/i)).toBeInTheDocument();
        });
    });

    it('displays friends list', async () => {
        const mockFriendships = [{ user_id: 'user-1', friend_id: 'user-2' }];
        const mockProfiles = [{ id: 'user-2', username: 'myfriend' }];
        const mockStats = [{
            user_id: 'user-2',
            classic_won: 5,
            classic_played: 10,
            current_streak: 2,
            best_streak: 5
        }];

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'friendships') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            or: vi.fn().mockResolvedValue({ data: mockFriendships, error: null })
                        })
                    })
                };
            }
            if (table === 'profiles') {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null })
                    })
                };
            }
            if (table === 'user_stats') {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ data: mockStats, error: null })
                    })
                };
            }
            return { select: vi.fn() };
        });

        render(<FriendsList />);

        await waitFor(() => {
            expect(screen.getByText('Friends (1)')).toBeInTheDocument();
            expect(screen.getByText('myfriend')).toBeInTheDocument();
            expect(screen.getByText('Win Rate: 50%')).toBeInTheDocument();
            expect(screen.getByText((content, element) => {
                return content.includes('2') && element?.parentElement?.textContent?.includes('Streak: 2');
            })).toBeInTheDocument();
        });
    });

    it('sends a challenge successfully', async () => {
        const mockFriendships = [{ user_id: 'user-1', friend_id: 'user-2' }];
        const mockProfiles = [{ id: 'user-2', username: 'myfriend' }];

        // Mock game creation chain
        const gameInsertMock = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'game-123' }, error: null })
            })
        });

        const secretInsertMock = vi.fn().mockResolvedValue({ error: null });
        const inviteInsertMock = vi.fn().mockResolvedValue({ error: null });

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'friendships') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            or: vi.fn().mockResolvedValue({ data: mockFriendships, error: null })
                        })
                    })
                };
            }
            if (table === 'profiles') {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null })
                    })
                };
            }
            if (table === 'user_stats') {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ data: [], error: null })
                    })
                };
            }
            if (table === 'multiplayer_games') {
                return { insert: gameInsertMock };
            }
            if (table === 'multiplayer_game_secrets') {
                return { insert: secretInsertMock };
            }
            if (table === 'game_invitations') {
                return { insert: inviteInsertMock };
            }
            return { select: vi.fn() };
        });

        const onChallengeMock = vi.fn();
        render(<FriendsList onChallenge={onChallengeMock} />);

        await waitFor(() => {
            expect(screen.getByText('myfriend')).toBeInTheDocument();
        });

        const challengeButton = screen.getByText('Challenge');
        fireEvent.click(challengeButton);

        await waitFor(() => {
            expect(screen.getByText('Sending...')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(gameInsertMock).toHaveBeenCalled();
            expect(secretInsertMock).toHaveBeenCalledWith(expect.objectContaining({
                game_id: 'game-123',
                target_word: 'TESTS'
            }));
            expect(inviteInsertMock).toHaveBeenCalledWith(expect.objectContaining({
                game_id: 'game-123',
                from_user_id: 'user-1',
                to_user_id: 'user-2',
                status: 'pending'
            }));

            expect(toast.success).toHaveBeenCalledWith('Challenge sent!');
            expect(onChallengeMock).toHaveBeenCalledWith('user-2');
        });
    });
});
