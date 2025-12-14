-- Add DELETE policy so players can abandon/close games
-- Host can delete games that haven't started
CREATE POLICY "Host can delete waiting games"
ON public.multiplayer_games
FOR DELETE
USING (
  auth.uid() = player1_id 
  AND game_started = false
);

-- Also add status 'abandoned' to track closed games
-- Allow players to update status to abandoned
CREATE POLICY "Players can abandon games"
ON public.multiplayer_games
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND (
    player1_id = auth.uid() 
    OR player2_id = auth.uid() 
    OR player3_id = auth.uid() 
    OR player4_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (
    player1_id = auth.uid() 
    OR player2_id = auth.uid() 
    OR player3_id = auth.uid() 
    OR player4_id = auth.uid()
  )
);

-- Drop the old restrictive host-only update policy
DROP POLICY IF EXISTS "Host can update games" ON public.multiplayer_games;