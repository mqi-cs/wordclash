import { useState, useEffect, useCallback } from "react";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Crown, Copy, Check } from "lucide-react";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  // Dynamically import supabase to avoid initialization issues
  const [supabase, setSupabase] = useState<any>(null);
  
  useEffect(() => {
    import("@/integrations/supabase/client").then(module => {
      setSupabase(module.supabase);
    });
  }, []);
  
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId] = useState(() => `player_${Math.random().toString(36).substr(2, 9)}`);
  const [targetWord, setTargetWord] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [copied, setCopied] = useState(false);
  const [joinedPlayers, setJoinedPlayers] = useState<JoinedPlayer[]>([]);
  const [playerSlot, setPlayerSlot] = useState<number>(1);
  const [gameStarted, setGameStarted] = useState(false);
  
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
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);

  // Create or join game
  useEffect(() => {
    if (!supabase) return;
    
    const initGame = async () => {
      // Check if joining existing game
      const urlParams = new URLSearchParams(window.location.search);
      const joinGameId = urlParams.get('join');
      
      if (joinGameId) {
        // Join existing game
        const { data: game, error } = await supabase
          .from("multiplayer_games")
          .select()
          .eq("id", joinGameId)
          .single();
        
        if (error || !game) {
          toast.error("Game not found");
          window.history.replaceState({}, '', '/');
          return;
        }
        
        if (game.game_started) {
          toast.error("Game already started");
          window.history.replaceState({}, '', '/');
          return;
        }
        
        // Find available slot
        let slot = 0;
        let updateData: any = {};
        
        if (!game.player2_id) {
          slot = 2;
          updateData.player2_id = playerId;
        } else if (!game.player3_id) {
          slot = 3;
          updateData.player3_id = playerId;
        } else if (!game.player4_id) {
          slot = 4;
          updateData.player4_id = playerId;
        } else {
          toast.error("Game is full");
          window.history.replaceState({}, '', '/');
          return;
        }
        
        // Update game with new player
        const { error: updateError } = await supabase
          .from("multiplayer_games")
          .update(updateData)
          .eq("id", joinGameId);
        
        if (updateError) {
          toast.error("Failed to join game");
          return;
        }
        
        setGameId(joinGameId);
        setTargetWord(game.target_word);
        setIsHost(false);
        setPlayerSlot(slot);
        toast.success("Joined game!");
        window.history.replaceState({}, '', '/');
      } else {
        // Create new game
        const word = getRandomWord();
        setTargetWord(word);
        
        const { data: game, error } = await supabase
          .from("multiplayer_games")
          .insert({
            target_word: word,
            player1_id: playerId,
            status: "waiting"
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating game:", error);
          toast.error("Failed to create game");
          return;
        }

        setGameId(game.id);
        setIsHost(true);
        setPlayerSlot(1);
      }
    };

    initGame();
  }, [playerId, supabase]);

  // Listen for players joining and game start
  useEffect(() => {
    if (!gameId || !supabase) return;

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
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, supabase, gameStarted]);

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
            
            // Check if opponent won
            if (guess.guess === targetWord) {
              setOpponentWon(true);
              setOpponentGameOver(true);
              setMyGameOver(true);
              toast.error("Opponent won! 🎉");
            }
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
  }, [gameId, playerId, targetWord, waiting, supabase, myGuesses.length]);

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
      if (myGameOver || myCurrentGuess.length >= WORD_LENGTH || waiting) return;
      setMyCurrentGuess((prev) => prev + key);
    },
    [myGameOver, myCurrentGuess, waiting]
  );

  const handleDelete = useCallback(() => {
    if (myGameOver || waiting) return;
    setMyCurrentGuess((prev) => prev.slice(0, -1));
  }, [myGameOver, waiting]);

  const handleEnter = useCallback(async () => {
    if (myGameOver || waiting || !supabase) return;

    // Check if both players are on the same row
    if (myGuesses.length !== opponentCurrentRow) {
      const message = myGuesses.length > opponentCurrentRow 
        ? "Waiting for opponent to catch up..."
        : "Opponent is waiting for you!";
      toast.info(message);
      setWaitingForOpponent(true);
      return;
    }

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

    const evaluation = evaluateGuess(myCurrentGuess, targetWord);
    updateLetterStatus(myCurrentGuess, evaluation);
    
    const newGuesses = [...myGuesses, myCurrentGuess];
    const newEvaluations = [...myEvaluations, evaluation];
    
    setMyGuesses(newGuesses);
    setMyEvaluations(newEvaluations);
    setMyCurrentGuess("");
    setWaitingForOpponent(false);

    // Save guess to database
    await supabase.from("multiplayer_guesses").insert({
      game_id: gameId,
      player_id: playerId,
      guess: myCurrentGuess,
      evaluation: evaluation,
      guess_number: newGuesses.length
    });

    // Check win condition
    if (myCurrentGuess === targetWord) {
      setMyWon(true);
      setMyGameOver(true);
      setOpponentGameOver(true);
      
      // Update game status
      await supabase
        .from("multiplayer_games")
        .update({ 
          status: "finished",
          winner_id: playerId,
          finished_at: new Date().toISOString()
        })
        .eq("id", gameId);
      
      toast.success("You won! 🎉");
      return;
    }

    // Check lose condition
    if (newGuesses.length >= MAX_GUESSES) {
      setMyGameOver(true);
      toast.error(`The word was ${targetWord}`);
    }
  }, [myCurrentGuess, myGuesses, myEvaluations, targetWord, myGameOver, gameId, playerId, waiting, supabase]);

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

  if (!supabase || waiting) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center">
              <Users className="w-16 h-16 text-primary animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold">
              {isHost ? "Waiting Room" : "Waiting for Host"}
            </h2>
            <p className="text-muted-foreground">
              {isHost ? "Share this link and start when ready" : "Waiting for host to start the game"}
            </p>
            
            {isHost && (
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

            {isHost && (
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Button variant="ghost" size="sm" onClick={onBackToMenu}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Menu
        </Button>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <span className="font-bold">Multiplayer</span>
        </div>
        <div className="w-20" />
      </div>
      
      <main className="flex-1 grid md:grid-cols-2 gap-2 p-2 md:p-4">
        {/* My Side */}
        <Card className={cn(
          "flex flex-col items-center justify-between p-2 md:p-4 border-2 transition-all",
          myWon && "border-green-500 bg-green-500/5"
        )}>
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="flex items-center gap-2">
              {myWon && <Crown className="w-5 h-5 text-yellow-500" />}
              <span className="text-sm md:text-base font-bold">You</span>
            </div>
            {waitingForOpponent && myGuesses.length !== opponentCurrentRow && (
              <span className="text-xs text-muted-foreground animate-pulse">
                {myGuesses.length > opponentCurrentRow ? "Waiting for opponent..." : "Opponent is waiting!"}
              </span>
            )}
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
          />
        </Card>

        {/* Opponent Side */}
        <Card className={cn(
          "flex flex-col items-center justify-start p-2 md:p-4 border-2 transition-all",
          opponentWon && "border-red-500 bg-red-500/5"
        )}>
          <div className="flex items-center gap-2 mb-2">
            {opponentWon && <Crown className="w-5 h-5 text-yellow-500" />}
            <span className="text-sm md:text-base font-bold">Opponent</span>
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
