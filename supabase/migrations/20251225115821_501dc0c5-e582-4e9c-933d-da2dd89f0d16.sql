-- Implement soft-delete for friendships
-- This provides audit trail and prevents spam re-requesting

-- Add soft-delete columns
ALTER TABLE public.friendships 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Drop the existing DELETE policy (we'll use soft-delete instead)
DROP POLICY IF EXISTS "Users can delete their friendships" ON public.friendships;

-- Update the SELECT policy to hide soft-deleted friendships
DROP POLICY IF EXISTS "Users can view their friendships" ON public.friendships;
CREATE POLICY "Users can view their friendships"
ON public.friendships FOR SELECT
USING (
  (auth.uid() = user_id OR auth.uid() = friend_id)
  AND deleted_at IS NULL
);

-- Allow users to soft-delete (unfriend) by setting deleted_at
-- This replaces the DELETE policy with a controlled UPDATE
CREATE POLICY "Users can unfriend via soft delete"
ON public.friendships FOR UPDATE
USING (
  auth.uid() = user_id OR auth.uid() = friend_id
)
WITH CHECK (
  -- Only allow setting deleted_at and deleted_by
  deleted_at IS NOT NULL 
  AND deleted_by = auth.uid()
);

-- Create index for efficient queries on non-deleted friendships
CREATE INDEX IF NOT EXISTS idx_friendships_active 
ON public.friendships (user_id, friend_id) 
WHERE deleted_at IS NULL;