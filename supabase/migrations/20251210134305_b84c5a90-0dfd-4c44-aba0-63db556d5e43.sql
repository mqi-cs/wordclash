-- Drop existing restrictive policies and create a proper one for active games
DROP POLICY IF EXISTS "Host can read target word" ON public.multiplayer_game_secrets;
DROP POLICY IF EXISTS "All players can read after game ends" ON public.multiplayer_game_secrets;

-- Allow all game players to read the target word once the game has started (not just when finished)
CREATE POLICY "Players can read target word when game active"
ON public.multiplayer_game_secrets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE multiplayer_games.id = multiplayer_game_secrets.game_id
    AND multiplayer_games.game_started = true
    AND (
      multiplayer_games.player1_id = auth.uid() OR
      multiplayer_games.player2_id = auth.uid() OR
      multiplayer_games.player3_id = auth.uid() OR
      multiplayer_games.player4_id = auth.uid()
    )
  )
);

-- Host can still read (for setting up the game before it starts)
CREATE POLICY "Host can always read target word"
ON public.multiplayer_game_secrets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE multiplayer_games.id = multiplayer_game_secrets.game_id
    AND multiplayer_games.player1_id = auth.uid()
  )
);