import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { IncomingChallenges } from '../components/IncomingChallenges';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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
    },
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }
}));

import { toast } from 'sonner';

describe('IncomingChallenges', () => {
    const mockUser = { id: 'user-1' };

    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({ user: mockUser });

        // Mock channel subscription
        (supabase.channel as any).mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnValue({
                unsubscribe: vi.fn()
            }),
        });

        // Mock default selects
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'game_invitations') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({ data: [], error: null })
                            })
                        }),
                        update: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ error: null })
                        })
                    })
                };
            }
            return { select: vi.fn() };
        });
    });

    it('renders nothing when no challenges', async () => {
        const { container } = render(
            <BrowserRouter>
                <IncomingChallenges />
            </BrowserRouter>
        );
        await waitFor(() => {
            expect(supabase.from).toHaveBeenCalledWith('game_invitations');
        });
        expect(container.firstChild).toBeNull();
    });

    it('displays incoming challenges', async () => {
        const mockInvitations = [{
            id: 'invite-1',
            game_id: 'game-1',
            from_user_id: 'user-2',
            created_at: '2023-01-01'
        }];
        const mockProfiles = [{ id: 'user-2', username: 'challenger' }];

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'game_invitations') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({ data: mockInvitations, error: null })
                            })
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
            return { select: vi.fn() };
        });

        render(
            <BrowserRouter>
                <IncomingChallenges />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Incoming Challenges (1)')).toBeInTheDocument();
            expect(screen.getByText('challenger')).toBeInTheDocument();
        });
    });

    it('accepts a challenge', async () => {
        const mockInvitations = [{
            id: 'invite-1',
            game_id: 'game-1',
            from_user_id: 'user-2',
            created_at: '2023-01-01'
        }];
        const mockProfiles = [{ id: 'user-2', username: 'challenger' }];

        const updateMock = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
        });

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'game_invitations') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({ data: mockInvitations, error: null })
                            })
                        })
                    }),
                    update: updateMock
                };
            }
            if (table === 'profiles') {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null })
                    })
                };
            }
            return { select: vi.fn() };
        });

        // Mock RPC join
        (supabase.rpc as any).mockResolvedValue({ data: { slot: 2 }, error: null });

        render(
            <BrowserRouter>
                <IncomingChallenges />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('challenger')).toBeInTheDocument();
        });

        const acceptButton = screen.getByText('Accept');
        fireEvent.click(acceptButton);

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith('join_multiplayer_game', { game_id_param: 'game-1' });
            expect(updateMock).toHaveBeenCalledWith({ status: 'accepted' });
            expect(toast.success).toHaveBeenCalledWith('Challenge accepted!');
        });
    });

    it('declines a challenge', async () => {
        const mockInvitations = [{
            id: 'invite-1',
            game_id: 'game-1',
            from_user_id: 'user-2',
            created_at: '2023-01-01'
        }];
        const mockProfiles = [{ id: 'user-2', username: 'challenger' }];

        const updateMock = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
        });

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'game_invitations') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({ data: mockInvitations, error: null })
                            })
                        })
                    }),
                    update: updateMock
                };
            }
            if (table === 'profiles') {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null })
                    })
                };
            }
            return { select: vi.fn() };
        });

        render(
            <BrowserRouter>
                <IncomingChallenges />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('challenger')).toBeInTheDocument();
        });

        const declineButton = screen.getByText('Decline');
        fireEvent.click(declineButton);

        await waitFor(() => {
            expect(updateMock).toHaveBeenCalledWith({ status: 'declined' });
            expect(toast.success).toHaveBeenCalledWith('Challenge declined');
        });
    });
});
