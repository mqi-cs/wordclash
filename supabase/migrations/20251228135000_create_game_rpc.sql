CREATE OR REPLACE FUNCTION create_multiplayer_game(target_word_param TEXT)
RETURNS UUID AS $$
DECLARE
  new_game_id UUID;
BEGIN
  -- Insert into multiplayer_games
  INSERT INTO multiplayer_games (player1_id, status)
  VALUES (auth.uid(), 'waiting')
  RETURNING id INTO new_game_id;

  -- Insert into multiplayer_game_secrets
  INSERT INTO multiplayer_game_secrets (game_id, target_word)
  VALUES (new_game_id, target_word_param);

  RETURN new_game_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
