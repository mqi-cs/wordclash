-- Add INSERT policy for multiplayer_games
-- Allow authenticated users to create a new game
CREATE POLICY "Authenticated users can create games"
ON public.multiplayer_games
FOR INSERT
WITH CHECK (
  auth.uid() = player1_id
);

-- Add INSERT policy for game_invitations
-- Allow authenticated users to invite others
CREATE POLICY "Users can create invitations"
ON public.game_invitations
FOR INSERT
WITH CHECK (
  auth.uid() = from_user_id
);

-- Add INSERT policy for multiplayer_guesses
-- Allow players to make guesses in games they are part of
CREATE POLICY "Players can insert guesses"
ON public.multiplayer_guesses
FOR INSERT
WITH CHECK (
  auth.uid() = player_id 
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
