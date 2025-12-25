-- Create server-side search function with validation
CREATE OR REPLACE FUNCTION public.search_users(search_term TEXT)
RETURNS TABLE(id UUID, username TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate search term length
  IF length(trim(search_term)) < 3 THEN
    RAISE EXCEPTION 'Search term must be at least 3 characters';
  END IF;
  
  IF length(trim(search_term)) > 50 THEN
    RAISE EXCEPTION 'Search term must be less than 50 characters';
  END IF;
  
  -- Return matching profiles (excluding self)
  RETURN QUERY
  SELECT p.id, p.username
  FROM profiles p
  WHERE p.username ILIKE '%' || trim(search_term) || '%'
  AND p.id != auth.uid()
  LIMIT 10;
END;
$$;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- Create more restrictive policies

-- Users can always view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Users can view profiles of accepted friends
CREATE POLICY "Users can view friend profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM friendships
    WHERE ((user_id = auth.uid() AND friend_id = profiles.id) 
           OR (friend_id = auth.uid() AND user_id = profiles.id))
    AND status = 'accepted'
    AND deleted_at IS NULL
  )
);

-- Users can view profiles of players in their games
CREATE POLICY "Users can view game player profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE (player1_id = auth.uid() OR player2_id = auth.uid() 
           OR player3_id = auth.uid() OR player4_id = auth.uid())
    AND (player1_id = profiles.id OR player2_id = profiles.id 
         OR player3_id = profiles.id OR player4_id = profiles.id)
  )
);

-- Users can view profiles of pending friend requests (both directions)
CREATE POLICY "Users can view pending request profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM friendships
    WHERE ((user_id = auth.uid() AND friend_id = profiles.id) 
           OR (friend_id = auth.uid() AND user_id = profiles.id))
    AND status = 'pending'
    AND deleted_at IS NULL
  )
);