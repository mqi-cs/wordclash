import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FriendSearch } from '../components/FriendSearch';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import * as useToastModule from '@/hooks/use-toast';

// Mock dependencies
vi.mock('../contexts/AuthContext', () => ({
    useAuth: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
    },
}));

// Mock useToast
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({
        toast: mockToast,
    }),
}));

describe('FriendSearch', () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };

    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({ user: mockUser });

        // Default mock for supabase.from chain
        (supabase.from as any).mockReturnValue({
            select: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null }), // Default: no existing relationship
                }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
        });
    });

    it('renders search input', () => {
        render(<FriendSearch />);
        expect(screen.getByPlaceholderText(/search users/i)).toBeInTheDocument();
    });

    it('validates short search query', async () => {
        render(<FriendSearch />);
        const input = screen.getByPlaceholderText(/search users/i);
        const searchButton = screen.getByRole('button'); // The search icon button

        fireEvent.change(input, { target: { value: 'ab' } });
        fireEvent.click(searchButton);

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Validation Error',
                description: expect.stringContaining('at least 3 characters')
            }));
        });
    });

    it('performs search and displays results', async () => {
        const mockResults = [
            { id: 'user-2', username: 'otheruser' }
        ];
        (supabase.rpc as any).mockResolvedValue({ data: mockResults, error: null });

        render(<FriendSearch />);
        const input = screen.getByPlaceholderText(/search users/i);
        const searchButton = screen.getByRole('button');

        fireEvent.change(input, { target: { value: 'other' } });
        fireEvent.click(searchButton);

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith('search_users', { search_term: 'other' });
        });

        expect(screen.getByText('otheruser')).toBeInTheDocument();
        expect(screen.getByText('Add Friend')).toBeInTheDocument();
    });

    it('handles search error', async () => {
        (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'Some error' } });

        render(<FriendSearch />);
        const input = screen.getByPlaceholderText(/search users/i);
        const searchButton = screen.getByRole('button');

        fireEvent.change(input, { target: { value: 'error' } });
        fireEvent.click(searchButton);

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Error',
                variant: 'destructive'
            }));
        });
    });

    it('sends friend request successfully', async () => {
        const mockResults = [
            { id: 'user-2', username: 'otheruser' }
        ];
        (supabase.rpc as any).mockResolvedValue({ data: mockResults, error: null });

        // Mock successful insert
        const insertMock = vi.fn().mockResolvedValue({ error: null });
        const orMock = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null }) });
        const selectMock = vi.fn().mockReturnValue({ or: orMock });
        (supabase.from as any).mockReturnValue({
            select: selectMock,
            insert: insertMock
        });

        render(<FriendSearch />);

        // Perform search first
        const input = screen.getByPlaceholderText(/search users/i);
        const searchButton = screen.getByRole('button');
        fireEvent.change(input, { target: { value: 'other' } });
        fireEvent.click(searchButton);

        await waitFor(() => {
            expect(screen.getByText('otheruser')).toBeInTheDocument();
        });

        // Click Add Friend
        const addFriendButton = screen.getByText('Add Friend');
        fireEvent.click(addFriendButton);

        await waitFor(() => {
            // Check if existing relationship was checked
            expect(supabase.from).toHaveBeenCalledWith('friendships');
            expect(selectMock).toHaveBeenCalled();
            expect(orMock).toHaveBeenCalled(); // Should check complex OR condition

            // Check insert
            expect(insertMock).toHaveBeenCalledWith({
                user_id: 'user-1',
                friend_id: 'user-2',
                status: 'pending'
            });

            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Friend request sent'
            }));
        });
    });

    it('prevents sending request if already friends', async () => {
        const mockResults = [
            { id: 'user-2', username: 'otheruser' }
        ];
        (supabase.rpc as any).mockResolvedValue({ data: mockResults, error: null });

        // Mock existing relationship
        const orMock = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'friendship-1' } }) }); // Found existing
        const selectMock = vi.fn().mockReturnValue({ or: orMock });
        const insertMock = vi.fn();
        (supabase.from as any).mockReturnValue({
            select: selectMock,
            insert: insertMock
        });

        render(<FriendSearch />);

        // Search
        const input = screen.getByPlaceholderText(/search users/i);
        const searchButton = screen.getByRole('button');
        fireEvent.change(input, { target: { value: 'other' } });
        fireEvent.click(searchButton);

        await waitFor(() => {
            expect(screen.getByText('otheruser')).toBeInTheDocument();
        });

        // Click Add Friend
        const addFriendButton = screen.getByText('Add Friend');
        fireEvent.click(addFriendButton);

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Already friends'
            }));
            expect(insertMock).not.toHaveBeenCalled();
        });
    });
});
