-- First, delete existing multiplayer data (incompatible with UUID conversion)
DELETE FROM multiplayer_guesses;
DELETE FROM multiplayer_games;

-- Convert TEXT columns to UUID
ALTER TABLE multiplayer_games 
  ALTER COLUMN player1_id TYPE uuid USING player1_id::uuid,
  ALTER COLUMN player2_id TYPE uuid USING player2_id::uuid,
  ALTER COLUMN player3_id TYPE uuid USING player3_id::uuid,
  ALTER COLUMN player4_id TYPE uuid USING player4_id::uuid,
  ALTER COLUMN winner_id TYPE uuid USING winner_id::uuid;

ALTER TABLE multiplayer_guesses
  ALTER COLUMN player_id TYPE uuid USING player_id::uuid;

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Anyone can view games" ON multiplayer_games;
DROP POLICY IF EXISTS "Anyone can create games" ON multiplayer_games;
DROP POLICY IF EXISTS "Anyone can update games" ON multiplayer_games;
DROP POLICY IF EXISTS "Anyone can view guesses" ON multiplayer_guesses;
DROP POLICY IF EXISTS "Anyone can create guesses" ON multiplayer_guesses;

-- Create secure RLS policies for multiplayer_games
CREATE POLICY "Players can view their games"
ON multiplayer_games FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    player1_id = auth.uid() OR 
    player2_id = auth.uid() OR 
    player3_id = auth.uid() OR 
    player4_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create games"
ON multiplayer_games FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND player1_id = auth.uid());

CREATE POLICY "Host can update games"
ON multiplayer_games FOR UPDATE
USING (auth.uid() IS NOT NULL AND player1_id = auth.uid());

-- Create secure RLS policies for multiplayer_guesses
CREATE POLICY "Players can view guesses in their games"
ON multiplayer_guesses FOR SELECT
USING (
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE id = game_id AND (
      player1_id = auth.uid() OR
      player2_id = auth.uid() OR
      player3_id = auth.uid() OR
      player4_id = auth.uid()
    )
  )
);

CREATE POLICY "Players can create their own guesses"
ON multiplayer_guesses FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND
  player_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM multiplayer_games
    WHERE id = game_id AND (
      player1_id = auth.uid() OR
      player2_id = auth.uid() OR
      player3_id = auth.uid() OR
      player4_id = auth.uid()
    )
  )
);