import { useState, useEffect, useCallback, useRef } from "react";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Users, Crown, Copy, Check, RefreshCw, Plus, Timer } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

interface MultiplayerGameProps {
  onBackToMenu: () => void;
}

export const MultiplayerGame = ({ onBackToMenu }: MultiplayerGameProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"select" | "create" | "join" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  
  // Game ID state
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);

  // Local state for keyboard input
  const [myCurrentGuess, setMyCurrentGuess] = useState("");
  const [myLetterStatus, setMyLetterStatus] = useState<Record<string, "correct" | "present" | "absent">>({});
  const [shake, setShake] = useState(false);

  // Turn timer
  const TURN_DURATION = 20;
  const [turnTimer, setTurnTimer] = useState(TURN_DURATION);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check URL parameters on mount
  useEffect(() => {
    if (loading || !user) return;
    const urlParams = new URLSearchParams(window.location.search);
    const existingGameId = urlParams.get('join') || urlParams.get('game');
    
    if (existingGameId) {
      handleJoinGame(existingGameId as Id<"games">);
    } else {
      setMode("select");
    }
  }, [loading, user]);

  // Convex Queries and Mutations
  const game = useQuery(api.games.getGame, gameId ? { gameId } : "skip");
  const guesses = useQuery(api.guesses.getGuesses, gameId ? { gameId } : "skip");
  
  // Condially fetch target word if game is over
  const targetWord = useQuery(api.games.getTargetWord, 
    gameId && (game?.status === "finished" || game?.status === "abandoned") 
    ? { gameId } 
    : "skip"
  );
  
  const createGameMut = useMutation(api.games.createGame);
  const joinGameMut = useMutation(api.games.joinGame);
  const submitGuessMut = useMutation(api.guesses.submitGuess);
  const setTargetWordMut = useMutation(api.games.setTargetWord);

  // Derived state
  const isHost = game?.player1Id === user?.id;
  const opponentId = isHost ? game?.player2Id : game?.player1Id;
  const gameStarted = game?.status === "in_progress" || game?.status === "finished";
  
  const myGuessesRaw = guesses?.filter(g => g.playerId === user?.id) || [];
  const oppGuessesRaw = guesses?.filter(g => g.playerId === opponentId) || [];
  
  const myGuesses = myGuessesRaw.map(g => g.guess);
  const myEvaluations = myGuessesRaw.map(g => g.evaluation);
  const oppGuesses = oppGuessesRaw.map(g => g.guess);
  const oppEvaluations = oppGuessesRaw.map(g => g.evaluation);
  
  const myGameOver = myEvaluations.some(ev => ev.every(e => e === "correct")) || myGuesses.length >= MAX_GUESSES || game?.status === "finished";
  const oppGameOver = oppEvaluations.some(ev => ev.every(e => e === "correct")) || oppGuesses.length >= MAX_GUESSES;
  
  const myWon = myEvaluations.some(ev => ev.every(e => e === "correct"));
  
  // Turn logic
  const isChallenge = game?.gameType === "challenge";
  const isMyTurn = isChallenge && game?.status === "in_progress" && !myGameOver && (
    myGuesses.length === oppGuesses.length ? isHost : myGuesses.length < oppGuesses.length
  );

  const handleJoinGame = async (idToJoin: Id<"games">) => {
    try {
      await joinGameMut({ gameId: idToJoin });
      setGameId(idToJoin);
      setMode(null);
      window.history.replaceState({}, '', '/');
    } catch (error: any) {
      toast.error(error.message || "Failed to join game");
    }
  };

  const createGame = async (gameType: "multiplayer" | "challenge") => {
    try {
      const newGameId = await createGameMut({ gameType });
      setGameId(newGameId);
      
      // In a real app we'd trigger a server action to pick the word, but we'll do it from client secure enough
      const words = ["REACT", "BUILD", "DREAM", "WORLD", "CRANE"]; // naive fallback
      const word = words[Math.floor(Math.random() * words.length)]; 
      await setTargetWordMut({ gameId: newGameId, word });
      
      setMode(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to create game");
    }
  };

  // Keep keyboard status updated
  useEffect(() => {
    if (!myGuessesRaw.length) {
      setMyLetterStatus({});
      return;
    }
    const newStatus: Record<string, "correct" | "present" | "absent"> = {};
    myGuessesRaw.forEach((g) => {
      g.guess.split("").forEach((letter, i) => {
        const current = newStatus[letter];
        const evaluated = g.evaluation[i];
        if (!current || (current === "absent" && evaluated !== "absent") || (current === "present" && evaluated === "correct")) {
          newStatus[letter] = evaluated;
        }
      });
    });
    setMyLetterStatus(newStatus);
  }, [myGuessesRaw]);

  // Turn timer effect
  useEffect(() => {
    if (!isChallenge || !gameStarted || game.status === "finished") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (isMyTurn && !myGameOver) {
      timerRef.current = setInterval(() => {
        setTurnTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            toast.error("Time's up! Turn skipped (not implemented locally)."); // naive
            return TURN_DURATION;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTurnTimer(TURN_DURATION);
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isMyTurn, isChallenge, gameStarted, game?.status, myGameOver]);

  const handleKeyPress = useCallback((key: string) => {
    if (myGameOver || myCurrentGuess.length >= WORD_LENGTH || !gameStarted || (isChallenge && !isMyTurn)) return;
    setMyCurrentGuess(prev => prev + key);
  }, [myGameOver, myCurrentGuess, gameStarted, isChallenge, isMyTurn]);

  const handleDelete = useCallback(() => {
    if (myGameOver || !gameStarted || (isChallenge && !isMyTurn)) return;
    setMyCurrentGuess(prev => prev.slice(0, -1));
  }, [myGameOver, gameStarted, isChallenge, isMyTurn]);

  const handleEnter = useCallback(async () => {
    if (myGameOver || !gameStarted || !gameId || (isChallenge && !isMyTurn)) return;

    if (myCurrentGuess.length !== WORD_LENGTH) {
      toast.error("Not enough letters");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    try {
      await submitGuessMut({ gameId, guess: myCurrentGuess });
      setMyCurrentGuess("");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit guess");
    }
  }, [myCurrentGuess, myGameOver, gameStarted, gameId, isChallenge, isMyTurn, submitGuessMut]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleEnter();
      else if (e.key === "Backspace") handleDelete();
      else if (/^[a-zA-Z]$/.test(e.key)) handleKeyPress(e.key.toUpperCase());
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyPress, handleDelete, handleEnter]);

  // Show mode selection if we don't have a game
  if (mode !== null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Button variant="ghost" className="self-start -ml-4" onClick={onBackToMenu}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="flex flex-col items-center max-w-sm w-full gap-6">
          <Button className="w-full h-14 text-lg bg-primary hover:bg-primary/90" onClick={() => createGame("multiplayer")}>
            <Users className="mr-2 h-5 w-5" /> Host Match (Real-time)
          </Button>
          <Button className="w-full h-14 text-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground" onClick={() => createGame("challenge")}>
            <Crown className="mr-2 h-5 w-5" /> Host Challenge (Turn-based)
          </Button>
          <div className="flex w-full gap-2">
            <Input 
              value={joinCode} 
              onChange={(e) => setJoinCode(e.target.value)} 
              placeholder="Paste Game ID to Join" 
              className="h-14 bg-background border-border" 
            />
            <Button className="h-14 px-6" onClick={() => handleJoinGame(joinCode as Id<"games">)}>
              Join
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="w-full flex justify-between items-center mb-4">
        <Button variant="ghost" onClick={onBackToMenu}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Exit
        </Button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full text-sm font-medium">
            <Users className="h-4 w-4 text-primary" /> {opponentId ? "2/2 Players" : "1/2 Players"}
          </div>
          {isChallenge && gameStarted && (
            <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold transition-colors", 
              isMyTurn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              <Timer className="h-4 w-4" /> {isMyTurn ? turnTimer : "Opponent's Turn"}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}?join=${gameId}`);
          toast.success("Game link copied!");
        }}>
          <Copy className="h-4 w-4 mr-2" /> Invite Link
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        {/* Opponent Area */}
        <div className="flex flex-col items-center">
          <h2 className={cn("text-xl font-bold tracking-tight mb-4 transition-colors", 
            !isMyTurn && isChallenge && gameStarted ? "text-primary" : "text-muted-foreground")}>
            Opponent
          </h2>
          <div className="scale-75 origin-top md:scale-90 opacity-80">
            <GameGrid
              guesses={oppGuesses}
              currentGuess=""
              evaluations={oppEvaluations}
              shake={false}
              isOpponent={true}
            />
          </div>
        </div>

        {/* My Area */}
        <div className="flex flex-col items-center">
          <h2 className={cn("text-xl font-bold tracking-tight mb-4 transition-colors", 
            isMyTurn && isChallenge && gameStarted ? "text-primary" : "")}>
            You
          </h2>
          <GameGrid
            guesses={myGuesses}
            currentGuess={myCurrentGuess}
            evaluations={myEvaluations}
            shake={shake}
            isOpponent={false}
          />
        </div>
      </div>

      {game?.status === "finished" && (
        <Card className="w-full max-w-md p-6 text-center shadow-lg border-primary/20 bg-background/95 backdrop-blur z-10 animate-in slide-in-from-bottom-8">
          <h2 className="text-2xl font-bold mb-4">
            {myWon ? "🏆 You Won!" : oppGameOver ? "The opponent won!" : "Game Over"}
          </h2>
          <p className="text-xl mb-6">The word was: <span className="font-bold text-primary">{targetWord}</span></p>
          <Button onClick={onBackToMenu} className="w-full">Return to Menu</Button>
        </Card>
      )}

      {!gameStarted && (
        <Card className="w-full max-w-md p-6 text-center border-primary/20 bg-background/95 backdrop-blur">
          <div className="animate-pulse space-y-4">
            <h3 className="text-lg font-semibold text-primary">Waiting for opponent...</h3>
            <p className="text-sm text-muted-foreground">Share the invite link to start the game.</p>
          </div>
        </Card>
      )}

      {gameStarted && !myGameOver && (
        <div className="w-[100vw] sm:w-[500px] mt-8">
          <Keyboard
            onKeyPress={handleKeyPress}
            onDelete={handleDelete}
            onEnter={handleEnter}
            letterStatus={myLetterStatus}
            disabled={!isMyTurn && isChallenge}
          />
        </div>
      )}
    </div>
  );
};
