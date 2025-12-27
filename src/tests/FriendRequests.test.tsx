import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FriendRequests } from '../components/FriendRequests';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// Mock dependencies
vi.mock('../contexts/AuthContext', () => ({
    useAuth: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

// Mock useToast - using the hook as FriendRequests does
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({
        toast: mockToast,
    }),
}));

describe('FriendRequests', () => {
    const mockUser = { id: 'user-1' };

    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({ user: mockUser });

        // Default mock setup
        const selectMock = vi.fn();
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'friendships') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ data: [], error: null }) // Default no requests
                        })
                    }),
                    update: vi.fn().mockReturnValue({
                        eq: vi.fn().mockResolvedValue({ error: null })
                    })
                };
            }
            if (table === 'profiles') {
                return {
                    select: vi.fn().mockReturnValue({
                        in: vi.fn().mockResolvedValue({ data: [], error: null })
                    })
                };
            }
            return { select: vi.fn() };
        });
    });

    it('renders nothing when no requests', async () => {
        const { container } = render(<FriendRequests />);
        // Initial render might check for requests
        await waitFor(() => {
            expect(supabase.from).toHaveBeenCalledWith('friendships');
        });
        expect(container.firstChild).toBeNull();
    });

    it('displays friend requests', async () => {
        // Mock requests
        const mockRequests = [{ id: 'req-1', user_id: 'user-2' }];
        const mockProfiles = [{ id: 'user-2', username: 'requester' }];

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'friendships') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ data: mockRequests, error: null })
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

        render(<FriendRequests />);

        await waitFor(() => {
            expect(screen.getByText('Friend Requests (1)')).toBeInTheDocument();
            expect(screen.getByText('requester')).toBeInTheDocument();
        });
    });

    it('accepts a friend request', async () => {
        const mockRequests = [{ id: 'req-1', user_id: 'user-2' }];
        const mockProfiles = [{ id: 'user-2', username: 'requester' }];
        const updateMock = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
        });

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'friendships') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ data: mockRequests, error: null })
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

        const onUpdateMock = vi.fn();
        render(<FriendRequests onUpdate={onUpdateMock} />);

        await waitFor(() => {
            expect(screen.getByText('requester')).toBeInTheDocument();
        });

        // Accept button (assuming it's the first button with UserCheck icon, but aria-label would be better if added)
        // Based on code: Button with UserCheck icon
        const buttons = screen.getAllByRole('button');
        const acceptButton = buttons[0]; // Assuming order

        fireEvent.click(acceptButton);

        await waitFor(() => {
            expect(updateMock).toHaveBeenCalledWith({ status: 'accepted' });
            expect(updateMock().eq).toHaveBeenCalledWith('id', 'req-1');
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Friend request accepted'
            }));
            expect(onUpdateMock).toHaveBeenCalled();
        });
    });

    it('rejects a friend request', async () => {
        const mockRequests = [{ id: 'req-1', user_id: 'user-2' }];
        const mockProfiles = [{ id: 'user-2', username: 'requester' }];
        const updateMock = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
        });

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'friendships') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ data: mockRequests, error: null })
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

        render(<FriendRequests />);

        await waitFor(() => {
            expect(screen.getByText('requester')).toBeInTheDocument();
        });

        // Validating buttons
        const buttons = screen.getAllByRole('button');
        const rejectButton = buttons[1]; // Assuming order (Accept, then Reject)

        fireEvent.click(rejectButton);

        await waitFor(() => {
            expect(updateMock).toHaveBeenCalledWith({ status: 'rejected' });
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Friend request rejected'
            }));
        });
    });
});
