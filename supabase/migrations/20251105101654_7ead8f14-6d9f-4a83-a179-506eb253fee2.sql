-- Add player3 and player4 columns to multiplayer_games
ALTER TABLE public.multiplayer_games 
ADD COLUMN player3_id text,
ADD COLUMN player4_id text,
ADD COLUMN game_started boolean NOT NULL DEFAULT false;

-- Update existing games to have game_started = true if they're active
UPDATE public.multiplayer_games 
SET game_started = true 
WHERE status = 'active';