-- Drop the existing restrictive policies
DROP POLICY IF EXISTS "Host can insert target word" ON public.multiplayer_game_secrets;

-- Create a permissive INSERT policy for the host
CREATE POLICY "Host can insert target word"
ON public.multiplayer_game_secrets
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE multiplayer_games.id = game_id
    AND multiplayer_games.player1_id = auth.uid()
  )
);

-- Also fix the SELECT policies to be permissive
DROP POLICY IF EXISTS "Host can always read target word" ON public.multiplayer_game_secrets;
DROP POLICY IF EXISTS "Players can read target word when game active" ON public.multiplayer_game_secrets;

-- Create a single permissive SELECT policy that covers both cases
CREATE POLICY "Players can read target word"
ON public.multiplayer_game_secrets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE multiplayer_games.id = multiplayer_game_secrets.game_id
    AND (
      -- Host can always read
      multiplayer_games.player1_id = auth.uid()
      -- Or any player when game has started
      OR (
        multiplayer_games.game_started = true
        AND (
          multiplayer_games.player1_id = auth.uid()
          OR multiplayer_games.player2_id = auth.uid()
          OR multiplayer_games.player3_id = auth.uid()
          OR multiplayer_games.player4_id = auth.uid()
        )
      )
    )
  )
);