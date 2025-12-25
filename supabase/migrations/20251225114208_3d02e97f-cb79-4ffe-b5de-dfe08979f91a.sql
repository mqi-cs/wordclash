-- Add DELETE policy for friendships table
-- Allows users to remove friend connections where they are involved
CREATE POLICY "Users can delete their friendships"
ON public.friendships FOR DELETE
USING (auth.uid() = user_id OR auth.uid() = friend_id);