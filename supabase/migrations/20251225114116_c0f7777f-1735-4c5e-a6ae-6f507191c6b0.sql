-- Fix overly permissive profile visibility
-- This restricts profile viewing to authenticated users only
-- which prevents unauthenticated user enumeration while preserving
-- the friend search and multiplayer game functionality

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create new policy: Authenticated users can view profiles
-- This allows friend search and seeing players in games
-- while preventing unauthenticated enumeration
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);
