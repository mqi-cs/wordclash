-- Fix 1: Create function to handle secure game joining
CREATE OR REPLACE FUNCTION public.join_multiplayer_game(
  game_id_param uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_record record;
  slot_number integer;
BEGIN
  -- Get the game and lock it for update
  SELECT * INTO game_record
  FROM multiplayer_games
  WHERE id = game_id_param
  FOR UPDATE;
  
  -- Verify game exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;
  
  -- Verify game hasn't started
  IF game_record.game_started = true OR game_record.status != 'waiting' THEN
    RAISE EXCEPTION 'Game already started';
  END IF;
  
  -- Find available slot
  IF game_record.player2_id IS NULL THEN
    slot_number := 2;
    UPDATE multiplayer_games
    SET player2_id = auth.uid()
    WHERE id = game_id_param;
  ELSIF game_record.player3_id IS NULL THEN
    slot_number := 3;
    UPDATE multiplayer_games
    SET player3_id = auth.uid()
    WHERE id = game_id_param;
  ELSIF game_record.player4_id IS NULL THEN
    slot_number := 4;
    UPDATE multiplayer_games
    SET player4_id = auth.uid()
    WHERE id = game_id_param;
  ELSE
    RAISE EXCEPTION 'Game is full';
  END IF;
  
  -- Return success with slot number
  RETURN jsonb_build_object(
    'success', true,
    'slot', slot_number,
    'game_id', game_id_param
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.join_multiplayer_game TO authenticated;

-- Fix 2: Create separate table for target words
CREATE TABLE public.multiplayer_game_secrets (
  game_id uuid PRIMARY KEY REFERENCES multiplayer_games(id) ON DELETE CASCADE,
  target_word text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on secrets table
ALTER TABLE multiplayer_game_secrets ENABLE ROW LEVEL SECURITY;

-- Only host can read target word before game ends
CREATE POLICY "Host can read target word"
ON multiplayer_game_secrets
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM multiplayer_games 
    WHERE id = game_id AND player1_id = auth.uid()
  )
);

-- All players can read after game ends
CREATE POLICY "All players can read after game ends"
ON multiplayer_game_secrets
FOR SELECT  
TO public
USING (
  EXISTS (
    SELECT 1 FROM multiplayer_games 
    WHERE id = game_id 
      AND status = 'finished'
      AND (player1_id = auth.uid() OR player2_id = auth.uid() OR 
           player3_id = auth.uid() OR player4_id = auth.uid())
  )
);

-- Only host can insert target word when creating game
CREATE POLICY "Host can insert target word"
ON multiplayer_game_secrets
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM multiplayer_games 
    WHERE id = game_id AND player1_id = auth.uid()
  )
);

-- Migrate existing target words to secrets table
INSERT INTO multiplayer_game_secrets (game_id, target_word)
SELECT id, target_word
FROM multiplayer_games
ON CONFLICT (game_id) DO NOTHING;

-- Remove target_word column from multiplayer_games
ALTER TABLE multiplayer_games DROP COLUMN target_word;