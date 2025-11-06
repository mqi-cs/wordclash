-- Create friendships table
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  friend_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can view their own friendships (both sent and received)
CREATE POLICY "Users can view their friendships"
ON public.friendships FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Users can create friend requests
CREATE POLICY "Users can send friend requests"
ON public.friendships FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update friendship status if they're the receiver
CREATE POLICY "Users can accept friend requests"
ON public.friendships FOR UPDATE
USING (auth.uid() = friend_id);

-- Trigger for updated_at
CREATE TRIGGER update_friendships_updated_at
BEFORE UPDATE ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Allow users to view their friends' stats
CREATE POLICY "Users can view friends stats"
ON public.user_stats FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.friendships
    WHERE ((user_id = auth.uid() AND friend_id = user_stats.user_id AND status = 'accepted')
    OR (friend_id = auth.uid() AND user_id = user_stats.user_id AND status = 'accepted'))
  )
);