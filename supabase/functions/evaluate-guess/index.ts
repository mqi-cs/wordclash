import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvaluateGuessRequest {
  game_id: string;
  guess: string;
}

interface EvaluationResult {
  evaluation: Array<"correct" | "present" | "absent">;
  is_correct: boolean;
  guess_number: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with service role to bypass RLS for reading secrets
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create client with user's JWT to verify they're a player
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    // Get the user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { game_id, guess }: EvaluateGuessRequest = await req.json();

    // Validate input
    if (!game_id || !guess) {
      return new Response(
        JSON.stringify({ error: "Missing game_id or guess" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (guess.length !== 5 || !/^[a-zA-Z]+$/.test(guess)) {
      return new Response(
        JSON.stringify({ error: "Invalid guess format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedGuess = guess.toLowerCase();

    // Verify user is a player in this game
    const { data: game, error: gameError } = await supabaseAdmin
      .from("multiplayer_games")
      .select("*")
      .eq("id", game_id)
      .single();

    if (gameError || !game) {
      return new Response(
        JSON.stringify({ error: "Game not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isPlayer = [game.player1_id, game.player2_id, game.player3_id, game.player4_id].includes(user.id);
    if (!isPlayer) {
      return new Response(
        JSON.stringify({ error: "You are not a player in this game" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!game.game_started) {
      return new Response(
        JSON.stringify({ error: "Game has not started yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (game.status === "finished") {
      return new Response(
        JSON.stringify({ error: "Game has already finished" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target word (using admin client to bypass RLS)
    const { data: secret, error: secretError } = await supabaseAdmin
      .from("multiplayer_game_secrets")
      .select("target_word")
      .eq("game_id", game_id)
      .single();

    if (secretError || !secret) {
      return new Response(
        JSON.stringify({ error: "Game secret not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetWord = secret.target_word.toLowerCase();

    // Evaluate the guess
    const evaluation: Array<"correct" | "present" | "absent"> = [];
    const targetLetters = targetWord.split("");
    const guessLetters = normalizedGuess.split("");

    // First pass: mark correct letters
    guessLetters.forEach((letter, i) => {
      if (letter === targetLetters[i]) {
        evaluation[i] = "correct";
        targetLetters[i] = "";
      }
    });

    // Second pass: mark present and absent letters
    guessLetters.forEach((letter, i) => {
      if (evaluation[i] !== "correct") {
        const targetIndex = targetLetters.indexOf(letter);
        if (targetIndex !== -1) {
          evaluation[i] = "present";
          targetLetters[targetIndex] = "";
        } else {
          evaluation[i] = "absent";
        }
      }
    });

    // Get current guess count for this player
    const { count, error: countError } = await supabaseAdmin
      .from("multiplayer_guesses")
      .select("*", { count: "exact", head: true })
      .eq("game_id", game_id)
      .eq("player_id", user.id);

    if (countError) {
      return new Response(
        JSON.stringify({ error: "Failed to get guess count" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const guessNumber = (count || 0) + 1;

    // Save the guess
    const { error: insertError } = await supabaseAdmin
      .from("multiplayer_guesses")
      .insert({
        game_id,
        player_id: user.id,
        guess: normalizedGuess,
        evaluation,
        guess_number: guessNumber,
      });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to save guess" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isCorrect = normalizedGuess === targetWord;

    // If correct, update game status
    if (isCorrect) {
      await supabaseAdmin
        .from("multiplayer_games")
        .update({
          status: "finished",
          winner_id: user.id,
          finished_at: new Date().toISOString(),
        })
        .eq("id", game_id);
    }

    const result: EvaluationResult = {
      evaluation,
      is_correct: isCorrect,
      guess_number: guessNumber,
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error evaluating guess:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
