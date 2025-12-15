-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can create games" ON public.multiplayer_games;
DROP POLICY IF EXISTS "Users can create invitations" ON public.game_invitations;
DROP POLICY IF EXISTS "Players can insert guesses" ON public.multiplayer_guesses;

-- Add INSERT policy for multiplayer_games
CREATE POLICY "Authenticated users can create games"
ON public.multiplayer_games
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = player1_id
);

-- Add INSERT policy for game_invitations
CREATE POLICY "Users can create invitations"
ON public.game_invitations
FOR INSERT
WITH CHECK (
  auth.uid() = from_user_id
);

-- Add INSERT policy for multiplayer_guesses
CREATE POLICY "Players can insert guesses"
ON public.multiplayer_guesses
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = player_id 
  AND EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE multiplayer_games.id = game_id
    AND (
      multiplayer_games.player1_id = auth.uid() OR
      multiplayer_games.player2_id = auth.uid() OR
      multiplayer_games.player3_id = auth.uid() OR
      multiplayer_games.player4_id = auth.uid()
    )
  )
);