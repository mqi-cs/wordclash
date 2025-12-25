-- Fix the game secrets policy to prevent mid-game cheating
-- Players should only see the target word AFTER the game is finished

-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Players can read target word" ON public.multiplayer_game_secrets;

-- Create new secure policy: Only allow reading target word after game finishes
-- Host can always read (they set the word), others only after game ends
CREATE POLICY "Players can read target word after game ends"
ON public.multiplayer_game_secrets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE multiplayer_games.id = multiplayer_game_secrets.game_id
    AND (
      -- Host can always read (they created the word)
      multiplayer_games.player1_id = auth.uid()
      -- Other players can only read after game is finished
      OR (
        multiplayer_games.status = 'finished'
        AND (
          multiplayer_games.player2_id = auth.uid()
          OR multiplayer_games.player3_id = auth.uid()
          OR multiplayer_games.player4_id = auth.uid()
        )
      )
    )
  )
);