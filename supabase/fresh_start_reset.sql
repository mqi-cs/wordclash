-- WARNING: THIS WILL DELETE ALL USERS AND GAME DATA
-- Run this in your Supabase SQL Editor to get a fresh start

BEGIN;

-- 1. Delete all game data (CASCADE handles dependencies)
TRUNCATE TABLE public.multiplayer_guesses CASCADE;
TRUNCATE TABLE public.multiplayer_game_secrets CASCADE;
TRUNCATE TABLE public.game_invitations CASCADE;
TRUNCATE TABLE public.multiplayer_games CASCADE;

-- 2. Delete all social data
TRUNCATE TABLE public.friendships CASCADE;

-- 3. Delete all stats and profiles
TRUNCATE TABLE public.user_stats CASCADE;
TRUNCATE TABLE public.profiles CASCADE;

-- 4. Delete the actual login accounts in auth schema
DELETE FROM auth.users;

COMMIT;
