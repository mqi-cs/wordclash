-- Create game_invitations table
CREATE TABLE public.game_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.multiplayer_games(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_invitations ENABLE ROW LEVEL SECURITY;

-- Users can view invitations they sent or received
CREATE POLICY "Users can view their invitations"
ON public.game_invitations FOR SELECT
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Users can create invitations they send
CREATE POLICY "Users can create invitations"
ON public.game_invitations FOR INSERT
WITH CHECK (auth.uid() = from_user_id);

-- Users can update invitations sent to them
CREATE POLICY "Users can update received invitations"
ON public.game_invitations FOR UPDATE
USING (auth.uid() = to_user_id);

-- Enable realtime for invitations
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invitations;