-- Create multiplayer games table
CREATE TABLE public.multiplayer_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_word TEXT NOT NULL,
  player1_id TEXT NOT NULL,
  player2_id TEXT,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, active, finished
  winner_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE
);

-- Create multiplayer guesses table
CREATE TABLE public.multiplayer_guesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.multiplayer_games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  guess TEXT NOT NULL,
  evaluation JSONB NOT NULL, -- array of 'correct', 'present', 'absent'
  guess_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.multiplayer_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_guesses ENABLE ROW LEVEL SECURITY;

-- RLS policies for multiplayer_games (public access for this game)
CREATE POLICY "Anyone can view games"
ON public.multiplayer_games
FOR SELECT
USING (true);

CREATE POLICY "Anyone can create games"
ON public.multiplayer_games
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update games"
ON public.multiplayer_games
FOR UPDATE
USING (true);

-- RLS policies for multiplayer_guesses (public access)
CREATE POLICY "Anyone can view guesses"
ON public.multiplayer_guesses
FOR SELECT
USING (true);

CREATE POLICY "Anyone can create guesses"
ON public.multiplayer_guesses
FOR INSERT
WITH CHECK (true);

-- Enable realtime for multiplayer tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplayer_games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplayer_guesses;

-- Create index for better performance
CREATE INDEX idx_multiplayer_guesses_game_id ON public.multiplayer_guesses(game_id);
CREATE INDEX idx_multiplayer_guesses_player_id ON public.multiplayer_guesses(player_id);