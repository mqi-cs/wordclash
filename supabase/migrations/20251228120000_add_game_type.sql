-- Add game_type column to multiplayer_games table
ALTER TABLE "public"."multiplayer_games" 
ADD COLUMN IF NOT EXISTS "game_type" text NOT NULL DEFAULT 'multiplayer';

-- Add comment to explain values
COMMENT ON COLUMN "public"."multiplayer_games"."game_type" IS 'Type of game: "multiplayer" (real-time) or "challenge" (turn-based)';
