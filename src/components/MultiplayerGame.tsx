import { useState, useEffect, useCallback, useRef } from "react";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Users, Crown, Copy, Check, RefreshCw, Plus, LogIn, Timer } from "lucide-react";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getUserFriendlyError } from "@/lib/errorHandler";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

interface MultiplayerGameProps {
  onBackToMenu: () => void;
}

interface GameState {
  guesses: string[];
  evaluations: Array<Array<"correct" | "present" | "absent">>;
  gameOver: boolean;
  won: boolean;
}

interface JoinedPlayer {
  id: string;
  slot: number;
}

export const MultiplayerGame = ({ onBackToMenu }: MultiplayerGameProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  // Dynamically import supabase to avoid initialization issues
  const [supabase, setSupabase] = useState<any>(null);
  
  useEffect(() => {
    import("@/integrations/supabase/client").then(module => {
      setSupabase(module.supabase);
    });
  }, []);
  
  const [gameId, setGameId] = useState<string | null>(null);
  const playerId = user?.id || "";
  const [targetWord, setTargetWord] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [copied, setCopied] = useState(false);
  const [joinedPlayers, setJoinedPlayers] = useState<JoinedPlayer[]>([]);
  const [playerSlot, setPlayerSlot] = useState<number>(1);
  const [gameStarted, setGameStarted] = useState(false);
  const [createGameError, setCreateGameError] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  
  // Mode selection state
  const [mode, setMode] = useState<"select" | "create" | "join" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  
  // My game state
  const [myGuesses, setMyGuesses] = useState<string[]>([]);
  const [myCurrentGuess, setMyCurrentGuess] = useState("");
  const [myEvaluations, setMyEvaluations] = useState<Array<Array<"correct" | "present" | "absent">>>([]);
  const [myLetterStatus, setMyLetterStatus] = useState<Record<string, "correct" | "present" | "absent">>({});
  const [myGameOver, setMyGameOver] = useState(false);
  const [myWon, setMyWon] = useState(false);
  const [shake, setShake] = useState(false);
  
  // Opponent game state
  const [opponentGuesses, setOpponentGuesses] = useState<string[]>([]);
  const [opponentEvaluations, setOpponentEvaluations] = useState<Array<Array<"correct" | "present" | "absent">>>([]);
  const [opponentGameOver, setOpponentGameOver] = useState(false);
  const [opponentWon, setOpponentWon] = useState(false);
  const [opponentCurrentRow, setOpponentCurrentRow] = useState(0);
  
  // Turn-based state
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [turnTimer, setTurnTimer] = useState(20);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const TURN_DURATION = 20;

  // Require authentication
  useEffect(() => {
    if (loading) return;
    if (!user) {
      toast.error("Please sign in to play multiplayer games");
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  // Fetch target word - only used after game ends to reveal the answer
  const fetchTargetWord = useCallback(async (gId: string) => {
    if (!supabase) return;
    
    const { data, error } = await supabase
      .from("multiplayer_game_secrets")
      .select("target_word")
      .eq("game_id", gId)
      .single();
    
    if (error) {
      if (import.meta.env.DEV) {
        console.error("Error fetching target word:", error);
      }
      // Don't show error - this is expected for non-host players until game ends
      return;
    }
    
    setTargetWord(data.target_word);
  }, [supabase]);

  // Check for URL parameters on mount
  useEffect(() => {
    if (!supabase || loading || !user) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const joinGameId = urlParams.get('join');
    const alreadyJoinedGameId = urlParams.get('game');
    const existingGameId = joinGameId || alreadyJoinedGameId;
    
    if (existingGameId) {
      // Auto-join from URL
      handleJoinGame(existingGameId);
    } else {
      // Show mode selection
      setMode("select");
      setWaiting(false);
    }
  }, [supabase, loading, user]);

  const handleJoinGame = async (gameIdToJoin: string) => {
    if (!supabase || !user) return;
    
    setIsJoining(true);
    
    // Check if we're already in the game
    const { data: game, error } = await supabase
      .from("multiplayer_games")
      .select()
      .eq("id", gameIdToJoin)
      .single();
    
    if (error || !game) {
      toast.error("Game not found");
      setIsJoining(false);
      window.history.replaceState({}, '', '/');
      return;
    }
    
    // Check if we're already a player in this game
    const isAlreadyPlayer = [game.player1_id, game.player2_id, game.player3_id, game.player4_id].includes(user.id);
    
    if (isAlreadyPlayer) {
      // We're already in the game - just set up the state
      const slot = game.player1_id === user.id ? 1 : 
                   game.player2_id === user.id ? 2 :
                   game.player3_id === user.id ? 3 : 4;
      
      // Initialize joined players list
      const players: JoinedPlayer[] = [];
      if (game.player1_id) players.push({ id: game.player1_id, slot: 1 });
      if (game.player2_id) players.push({ id: game.player2_id, slot: 2 });
      if (game.player3_id) players.push({ id: game.player3_id, slot: 3 });
      if (game.player4_id) players.push({ id: game.player4_id, slot: 4 });
      setJoinedPlayers(players);
      
      setGameId(gameIdToJoin);
      setIsHost(game.player1_id === user.id);
      setPlayerSlot(slot);
      setMode(null);
      
      // If game already started, just set state
      if (game.game_started) {
        setGameStarted(true);
        setWaiting(false);
      } else {
        setWaiting(true);
      }
      
      setIsJoining(false);
      window.history.replaceState({}, '', '/');
      return;
    }
    
    // Not in the game yet - try to join
    if (game.game_started) {
      toast.error("Game already started");
      setIsJoining(false);
      window.history.replaceState({}, '', '/');
      return;
    }
    
    // Use secure function to join game
    const { data: joinResult, error: joinError } = await supabase.rpc('join_multiplayer_game', {
      game_id_param: gameIdToJoin
    });

    if (joinError) {
      if (import.meta.env.DEV) console.error("Failed to join game:", joinError);
      toast.error(getUserFriendlyError(joinError));
      setIsJoining(false);
      return;
    }
    
    // Initialize joined players list with current players
    const players: JoinedPlayer[] = [];
    if (game.player1_id) players.push({ id: game.player1_id, slot: 1 });
    if (game.player2_id) players.push({ id: game.player2_id, slot: 2 });
    if (game.player3_id) players.push({ id: game.player3_id, slot: 3 });
    if (game.player4_id) players.push({ id: game.player4_id, slot: 4 });
    // Add ourselves if not already in the list
    if (!players.find(p => p.id === user.id)) {
      players.push({ id: user.id, slot: joinResult.slot });
    }
    setJoinedPlayers(players);
    
    setGameId(gameIdToJoin);
    setIsHost(false);
    setPlayerSlot(joinResult.slot);
    setMode(null);
    setWaiting(true);
    setIsJoining(false);
    toast.success("Joined game!");
    window.history.replaceState({}, '', '/');
  };

  const createNewGame = async () => {
    if (!supabase || !user) return;
    
    setIsCreatingGame(true);
    setCreateGameError(null);
    
    const word = getRandomWord();
    setTargetWord(word);
    
    const { data: game, error } = await supabase
      .from("multiplayer_games")
      .insert({
        player1_id: user.id,
        status: "waiting"
      })
      .select()
      .single();

    if (error) {
      if (import.meta.env.DEV) console.error("Failed to create game (multiplayer_games insert):", error);
      const friendlyError = getUserFriendlyError(error);
      setCreateGameError(friendlyError);
      toast.error(friendlyError);
      setIsCreatingGame(false);
      return;
    }

    // Store target word in secrets table
    const { error: secretError } = await supabase
      .from("multiplayer_game_secrets")
      .insert({
        game_id: game.id,
        target_word: word
      });

    if (secretError) {
      if (import.meta.env.DEV) console.error("Failed to create game (multiplayer_game_secrets insert):", secretError);
      
      // Cleanup: delete the half-created game
      const { error: deleteError } = await supabase
        .from("multiplayer_games")
        .delete()
        .eq("id", game.id);
      
      if (deleteError && import.meta.env.DEV) {
        console.error("Failed to cleanup game after secret insert failure:", deleteError);
      }
      
      const friendlyError = getUserFriendlyError(secretError);
      setCreateGameError(friendlyError);
      toast.error(friendlyError);
      setIsCreatingGame(false);
      return;
    }

    // Initialize joined players with host
    setJoinedPlayers([{ id: user.id, slot: 1 }]);
    setGameId(game.id);
    setIsHost(true);
    setPlayerSlot(1);
    setMode(null);
    setWaiting(true);
    setIsCreatingGame(false);
    setCreateGameError(null);
  };

  const handleJoinWithCode = () => {
    const trimmedCode = joinCode.trim();
    if (!trimmedCode) {
      toast.error("Please enter a game code");
      return;
    }
    handleJoinGame(trimmedCode);
  };

  // Listen for players joining and game start
  useEffect(() => {
    if (!gameId || !supabase || !user) return;

    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "multiplayer_games",
          filter: `id=eq.${gameId}`
        },
        (payload: any) => {
          const game = payload.new;
          const players: JoinedPlayer[] = [];
          
          if (game.player1_id) players.push({ id: game.player1_id, slot: 1 });
          if (game.player2_id) players.push({ id: game.player2_id, slot: 2 });
          if (game.player3_id) players.push({ id: game.player3_id, slot: 3 });
          if (game.player4_id) players.push({ id: game.player4_id, slot: 4 });
          
          setJoinedPlayers(players);
          
          if (game.game_started && !gameStarted) {
            setGameStarted(true);
            setWaiting(false);
            toast.success("Game starting!");
            // Host (player1) goes first
            if (game.player1_id === user?.id) {
              setIsMyTurn(true);
              setTurnTimer(TURN_DURATION);
            } else {
              setIsMyTurn(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, supabase, gameStarted, isHost, fetchTargetWord]);

  // Listen for opponent guesses and track presence
  useEffect(() => {
    if (!gameId || waiting || !supabase) return;

    const channel = supabase
      .channel(`game-room-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "multiplayer_guesses",
          filter: `game_id=eq.${gameId}`
        },
        (payload: any) => {
          const guess = payload.new;
          if (guess.player_id !== playerId) {
            setOpponentGuesses(prev => [...prev, guess.guess]);
            setOpponentEvaluations(prev => [...prev, guess.evaluation]);
            setOpponentCurrentRow(guess.guess_number);
            
            // Check if opponent won by checking if all letters are correct
            const allCorrect = guess.evaluation.every((e: string) => e === "correct");
            if (allCorrect) {
              setOpponentWon(true);
              setOpponentGameOver(true);
              setMyGameOver(true);
              toast.error("Opponent won!");
              // Fetch target word to display
              fetchTargetWord(gameId!);
            } else {
              // Opponent finished their turn, now it's my turn
              setIsMyTurn(true);
              setTurnTimer(TURN_DURATION);
            }
          } else {
            // My guess was processed, now it's opponent's turn
            setIsMyTurn(false);
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const presences = Object.values(state).flat() as any[];
        const opponent = presences.find((p: any) => p.player_id !== playerId);
        if (opponent) {
          setOpponentCurrentRow(opponent.current_row);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            player_id: playerId,
            current_row: myGuesses.length
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, playerId, targetWord, waiting, supabase, myGuesses.length, fetchTargetWord]);

  // Timer effect for turn-based gameplay
  useEffect(() => {
    if (waiting || myGameOver || opponentGameOver) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (isMyTurn) {
      timerRef.current = setInterval(() => {
        setTurnTimer(prev => {
          if (prev <= 1) {
            // Time's up - skip turn
            clearInterval(timerRef.current!);
            timerRef.current = null;
            setIsMyTurn(false);
            setMyCurrentGuess("");
            toast.error("Time's up! Turn skipped.");
            return TURN_DURATION;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Reset timer when it becomes opponent's turn
      setTurnTimer(TURN_DURATION);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isMyTurn, waiting, myGameOver, opponentGameOver]);

  const evaluateGuess = (guess: string, target: string) => {
    const result: Array<"correct" | "present" | "absent"> = [];
    const targetLetters = target.split("");
    const guessLetters = guess.split("");

    guessLetters.forEach((letter, i) => {
      if (letter === targetLetters[i]) {
        result[i] = "correct";
        targetLetters[i] = "";
      }
    });

    guessLetters.forEach((letter, i) => {
      if (result[i] !== "correct") {
        const targetIndex = targetLetters.indexOf(letter);
        if (targetIndex !== -1) {
          result[i] = "present";
          targetLetters[targetIndex] = "";
        } else {
          result[i] = "absent";
        }
      }
    });

    return result;
  };

  const updateLetterStatus = (guess: string, evaluation: Array<"correct" | "present" | "absent">) => {
    const newStatus = { ...myLetterStatus };
    guess.split("").forEach((letter, i) => {
      const currentStatus = newStatus[letter];
      const newLetterStatus = evaluation[i];
      
      if (!currentStatus || 
          (currentStatus === "absent" && newLetterStatus !== "absent") ||
          (currentStatus === "present" && newLetterStatus === "correct")) {
        newStatus[letter] = newLetterStatus;
      }
    });
    setMyLetterStatus(newStatus);
  };

  const handleKeyPress = useCallback(
    (key: string) => {
      if (myGameOver || myCurrentGuess.length >= WORD_LENGTH || waiting || !isMyTurn) return;
      setMyCurrentGuess((prev) => prev + key);
    },
    [myGameOver, myCurrentGuess, waiting, isMyTurn]
  );

  const handleDelete = useCallback(() => {
    if (myGameOver || waiting || !isMyTurn) return;
    setMyCurrentGuess((prev) => prev.slice(0, -1));
  }, [myGameOver, waiting, isMyTurn]);

  const handleEnter = useCallback(async () => {
    if (myGameOver || waiting || !supabase || !isMyTurn) return;

    if (myCurrentGuess.length !== WORD_LENGTH) {
      toast.error("Not enough letters");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    if (!isValidWord(myCurrentGuess)) {
      toast.error("Not in word list");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    // Use server-side evaluation to prevent cheating
    const { data, error } = await supabase.functions.invoke('evaluate-guess', {
      body: { game_id: gameId, guess: myCurrentGuess }
    });

    if (error || !data) {
      if (import.meta.env.DEV) console.error("Error evaluating guess:", error);
      toast.error("Failed to submit guess. Please try again.");
      return;
    }

    const evaluation = data.evaluation as Array<"correct" | "present" | "absent">;
    updateLetterStatus(myCurrentGuess, evaluation);
    
    const newGuesses = [...myGuesses, myCurrentGuess];
    const newEvaluations = [...myEvaluations, evaluation];
    
    setMyGuesses(newGuesses);
    setMyEvaluations(newEvaluations);
    setMyCurrentGuess("");

    // Check win condition (server already updated game status if won)
    if (data.is_correct) {
      setMyWon(true);
      setMyGameOver(true);
      setOpponentGameOver(true);
      toast.success("You won! 🎉");
      // Fetch the word now that game is finished
      fetchTargetWord(gameId!);
      return;
    }

    // Check lose condition - both players out of guesses
    if (newGuesses.length >= MAX_GUESSES && opponentGuesses.length >= MAX_GUESSES) {
      setMyGameOver(true);
      // Fetch the word to show what it was
      fetchTargetWord(gameId!);
      toast.error("Game over - no one guessed the word!");
    } else {
      // End my turn, opponent's turn now
      setIsMyTurn(false);
    }
  }, [myCurrentGuess, myGuesses, myEvaluations, myGameOver, gameId, playerId, waiting, supabase, fetchTargetWord, isMyTurn, opponentGuesses.length]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleEnter();
      } else if (e.key === "Backspace") {
        handleDelete();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleKeyPress(e.key.toUpperCase());
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyPress, handleDelete, handleEnter]);

  const copyGameLink = () => {
    if (!gameId) return;
    const link = `${window.location.origin}?join=${gameId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Game link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = async () => {
    if (!gameId || !supabase || joinedPlayers.length < 2) {
      toast.error("Need at least 2 players to start");
      return;
    }

    await supabase
      .from("multiplayer_games")
      .update({
        game_started: true,
        status: "active",
        started_at: new Date().toISOString()
      })
      .eq("id", gameId);
  };


  // Mode selection screen
  if (mode === "select") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center">
              <Users className="w-16 h-16 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Multiplayer</h2>
            <p className="text-muted-foreground">Create a new game or join an existing one</p>
          </div>
          
          <div className="grid gap-4">
            <Button 
              onClick={() => {
                setMode("create");
                createNewGame();
              }}
              className="w-full h-16 text-lg"
              disabled={isCreatingGame}
            >
              {isCreatingGame ? (
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Plus className="w-5 h-5 mr-2" />
              )}
              Create Game
            </Button>
            
            <Button 
              onClick={() => setMode("join")}
              variant="outline"
              className="w-full h-16 text-lg"
            >
              <LogIn className="w-5 h-5 mr-2" />
              Join Game
            </Button>
          </div>
          
          <Button variant="ghost" onClick={onBackToMenu} className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Menu
          </Button>
        </Card>
      </div>
    );
  }

  // Join with code screen
  if (mode === "join") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center">
              <LogIn className="w-16 h-16 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Join Game</h2>
            <p className="text-muted-foreground">Enter the game code shared by the host</p>
          </div>
          
          <div className="space-y-4">
            <Input
              placeholder="Enter game code..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="text-center text-lg h-12"
              disabled={isJoining}
            />
            
            <Button 
              onClick={handleJoinWithCode}
              className="w-full h-12"
              disabled={isJoining || !joinCode.trim()}
            >
              {isJoining ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4 mr-2" />
              )}
              Join Game
            </Button>
          </div>
          
          <Button variant="ghost" onClick={() => setMode("select")} className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Card>
      </div>
    );
  }

  if (!supabase || waiting) {
    // Show error state with retry option
    if (createGameError && !gameId) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
          <Card className="max-w-md w-full p-8 space-y-6">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center">
                <Users className="w-16 h-16 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold text-destructive">Failed to Create Game</h2>
              <p className="text-muted-foreground">{createGameError}</p>
              
              <Button 
                onClick={() => {
                  setMode("select");
                  setCreateGameError(null);
                }} 
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
            
            <Button variant="outline" onClick={onBackToMenu} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Menu
            </Button>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center">
              <Users className="w-16 h-16 text-primary animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold">
              {isCreatingGame ? "Creating Game..." : isHost ? "Waiting Room" : "Waiting for Host"}
            </h2>
            <p className="text-muted-foreground">
              {isCreatingGame 
                ? "Setting up your game..." 
                : isHost 
                  ? "Share this link and start when ready" 
                  : "Waiting for host to start the game"}
            </p>
            
            {isHost && gameId && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1">Game Code</p>
                  <p className="font-mono text-sm font-bold break-all">{gameId}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}?join=${gameId}`}
                    className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm"
                  />
                  <Button onClick={copyGameLink} size="icon">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-semibold">Players ({joinedPlayers.length}/4):</p>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((slot) => {
                  const player = joinedPlayers.find(p => p.slot === slot);
                  return (
                    <div
                      key={slot}
                      className={cn(
                        "p-3 rounded-lg border-2 text-sm font-medium",
                        player ? "border-primary bg-primary/10" : "border-muted bg-muted/30"
                      )}
                    >
                      {player ? (
                        <div className="flex items-center gap-2">
                          {slot === 1 && <Crown className="w-4 h-4 text-yellow-500" />}
                          Player {slot}
                          {player.id === playerId && " (You)"}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Empty</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {isHost && gameId && (
              <Button 
                onClick={handleStartGame} 
                className="w-full"
                disabled={joinedPlayers.length < 2}
              >
                Start Game
              </Button>
            )}
          </div>
          
          <Button variant="outline" onClick={onBackToMenu} className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Menu
          </Button>
        </Card>
      </div>
    );
  }

  const gameOver = myGameOver || opponentGameOver;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Button variant="ghost" size="sm" onClick={onBackToMenu}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Menu
        </Button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <span className="font-bold">Multiplayer</span>
          </div>
          {!gameOver && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full",
              isMyTurn ? "bg-green-500/20 text-green-600" : "bg-muted text-muted-foreground"
            )}>
              <Timer className="w-4 h-4" />
              <span className="font-mono font-bold text-lg">{turnTimer}s</span>
            </div>
          )}
        </div>
        <div className="w-20" />
      </div>

      {/* Turn indicator */}
      {!gameOver && (
        <div className={cn(
          "text-center py-2 font-semibold text-sm transition-all",
          isMyTurn ? "bg-green-500/20 text-green-600" : "bg-yellow-500/20 text-yellow-600"
        )}>
          {isMyTurn ? "Your turn - make your guess!" : "Opponent's turn - wait..."}
        </div>
      )}

      {/* Game Over - Show target word */}
      {gameOver && targetWord && (
        <div className="text-center py-4 bg-muted/50 border-b">
          <p className="text-sm text-muted-foreground mb-1">The word was:</p>
          <p className="text-2xl font-bold tracking-widest uppercase text-primary">{targetWord}</p>
        </div>
      )}
      
      <main className="flex-1 grid md:grid-cols-2 gap-2 p-2 md:p-4">
        {/* My Side */}
        <Card className={cn(
          "flex flex-col items-center justify-between p-2 md:p-4 border-2 transition-all",
          myWon && "border-green-500 bg-green-500/5",
          isMyTurn && !gameOver && "border-green-500/50"
        )}>
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="flex items-center gap-2">
              {myWon && <Crown className="w-5 h-5 text-yellow-500" />}
              <span className="text-sm md:text-base font-bold">You</span>
              {isMyTurn && !gameOver && (
                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                  YOUR TURN
                </span>
              )}
            </div>
          </div>
          <GameGrid
            guesses={myGuesses}
            currentGuess={myCurrentGuess}
            evaluations={myEvaluations}
            maxGuesses={MAX_GUESSES}
            wordLength={WORD_LENGTH}
            shake={shake}
            revealedHints={[]}
            targetWord={targetWord}
          />
          <Keyboard
            onKeyPress={handleKeyPress}
            onEnter={handleEnter}
            onDelete={handleDelete}
            letterStatus={myLetterStatus}
            disabled={!isMyTurn || gameOver}
          />
        </Card>

        {/* Opponent Side */}
        <Card className={cn(
          "flex flex-col items-center justify-start p-2 md:p-4 border-2 transition-all",
          opponentWon && "border-red-500 bg-red-500/5",
          !isMyTurn && !gameOver && "border-yellow-500/50"
        )}>
          <div className="flex items-center gap-2 mb-2">
            {opponentWon && <Crown className="w-5 h-5 text-yellow-500" />}
            <span className="text-sm md:text-base font-bold">Opponent</span>
            {!isMyTurn && !gameOver && (
              <span className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                THEIR TURN
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1 my-4">
            {Array.from({ length: MAX_GUESSES }).map((_, rowIndex) => {
              const guess = opponentGuesses[rowIndex];
              const evaluation = opponentEvaluations[rowIndex];
              
              return (
                <div key={rowIndex} className="flex gap-1 justify-center">
                  {Array.from({ length: WORD_LENGTH }).map((_, colIndex) => {
                    const hasGuess = guess && guess[colIndex];
                    const status = evaluation ? evaluation[colIndex] : "empty";
                    
                    return (
                      <div
                        key={colIndex}
                        className={cn(
                          "w-11 h-11 sm:w-14 sm:h-14 border-2 flex items-center justify-center text-xl sm:text-2xl font-bold uppercase transition-all",
                          !hasGuess && "border-game-border bg-game-empty",
                          hasGuess && status === "correct" && "bg-game-correct border-game-correct",
                          hasGuess && status === "present" && "bg-game-present border-game-present",
                          hasGuess && status === "absent" && "bg-game-absent border-game-absent"
                        )}
                        style={hasGuess ? { filter: "blur(8px)" } : undefined}
                      >
                        {hasGuess ? guess[colIndex] : ""}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Card>
      </main>
    </div>
  );
};
