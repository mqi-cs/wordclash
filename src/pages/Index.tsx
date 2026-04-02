import { useState, useEffect, useCallback, lazy, Suspense, useRef } from "react";
import { GameHeader } from "@/components/GameHeader";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { ResultModal, HelpModal } from "@/components/GameModal";
import { GameMenu, GameMode } from "@/components/GameMenu";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy, Brain, Zap, Target } from "lucide-react";
import { Leaderboard } from "@/components/Leaderboard";
import { saveGameResult } from "@/lib/gameHistory";
import { getInitialBotState, updateBotState, getBotNextGuess, BotState, BotDifficulty } from "@/lib/wordClashBot";
import { useStatsUpdate } from "@/hooks/useStatsUpdate";
import { useAuth } from "@/contexts/AuthContext";
import { evaluateGuess } from "@/lib/gameLogic";
import { UsernameSetupScreen } from "@/components/UsernameSetupScreen";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MultiplayerGame = lazy(() => import("@/components/MultiplayerGame").then(module => ({ default: module.MultiplayerGame })));
const BotGame = lazy(() => import("@/components/BotGame").then(module => ({ default: module.BotGame })));

const WORD_LENGTH = 5;
const CLASSIC_GUESSES = 6;
const HARD_GUESSES = 10;
const TIMED_INITIAL_SECONDS = 90;
const TIMED_BONUS_SECONDS = 30;

type ActiveHint = {
  turn: number;
  position: number;
};

const Index = () => {
  const { user } = useAuth();
  const { updateStats } = useStatsUpdate();

  // Check for URL params to auto-start multiplayer
  const urlParams = new URLSearchParams(window.location.search);
  const joinGameId = urlParams.get('join') || urlParams.get('game');
  const modeParam = urlParams.get('mode');
  const initialMode = (joinGameId || modeParam === 'multiplayer') ? 'multiplayer' : null;

  const [gameMode, setGameMode] = useState<GameMode | null>(initialMode);
  const [targetWord, setTargetWord] = useState(() => getRandomWord());
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [evaluations, setEvaluations] = useState<Array<Array<"correct" | "present" | "absent">>>([]);
  const [letterStatus, setLetterStatus] = useState<Record<string, "correct" | "present" | "absent">>({});
  const [shake, setShake] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [activeHint, setActiveHint] = useState<ActiveHint | null>(null);

  // Bot state
  const [botActive, setBotActive] = useState(false);
  const [botState, setBotState] = useState<BotState>(getInitialBotState());
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("easy");
  const [showBotDifficultyModal, setShowBotDifficultyModal] = useState(false);

  // Ref to always access the latest handleEnter function from timeouts
  const handleEnterRef = useRef<() => void>(() => {});

  // Timed mode state
  const [timeLeft, setTimeLeft] = useState(TIMED_INITIAL_SECONDS);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [timedGameActive, setTimedGameActive] = useState(false);
  const [totalGuesses, setTotalGuesses] = useState(0);

  const maxGuesses = gameMode === "hard" ? HARD_GUESSES : gameMode === "timed" ? 999 : CLASSIC_GUESSES;
  const currentTurn = guesses.length;
  const isHintActiveThisTurn = activeHint?.turn === currentTurn;
  const activeHintPosition = isHintActiveThisTurn ? activeHint.position : null;

  useEffect(() => {
    if (!activeHint || activeHint.turn === currentTurn) return;
    setActiveHint(null);
  }, [activeHint, currentTurn]);



  const updateLetterStatus = (guess: string, evaluation: Array<"correct" | "present" | "absent">) => {
    const newStatus = { ...letterStatus };
    guess.split("").forEach((letter, i) => {
      const currentStatus = newStatus[letter];
      const newLetterStatus = evaluation[i];

      if (gameMode === "hard" && newLetterStatus !== "correct") {
        return;
      }

      // Only update if new status is better (correct > present > absent)
      if (!currentStatus ||
        (currentStatus === "absent" && newLetterStatus !== "absent") ||
        (currentStatus === "present" && newLetterStatus === "correct")) {
        newStatus[letter] = newLetterStatus;
      }
    });
    setLetterStatus(newStatus);
  };

  const handleKeyPress = useCallback(
    (key: string) => {
      if (gameOver || currentGuess.length >= WORD_LENGTH) return;
      setCurrentGuess((prev) => prev + key);
    },
    [gameOver, currentGuess]
  );

  const handleDelete = useCallback(() => {
    if (gameOver) return;
    setCurrentGuess((prev) => prev.slice(0, -1));
  }, [gameOver]);

  const handleEnter = useCallback(() => {
    if (gameOver) return;

    if (currentGuess.length !== WORD_LENGTH) {
      toast.error("Not enough letters");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    if (!isValidWord(currentGuess)) {
      toast.error("Not in word list");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    const evaluation = evaluateGuess(currentGuess, targetWord, gameMode);
    updateLetterStatus(currentGuess, evaluation);

    const newGuesses = [...guesses, currentGuess];
    const newEvaluations = [...evaluations, evaluation];

    setGuesses(newGuesses);
    setEvaluations(newEvaluations);
    setCurrentGuess("");
    setActiveHint(null);

    // Track total guesses in timed mode
    if (gameMode === "timed") {
      setTotalGuesses(prev => prev + 1);
    }

    // Check win condition
    if (currentGuess === targetWord) {
      // Handle timed mode - continue with unlimited rounds until time runs out
      if (gameMode === "timed") {
        setWordsCompleted(prev => prev + 1);
        setTimeLeft(prev => prev + TIMED_BONUS_SECONDS);
        toast.success(`+${TIMED_BONUS_SECONDS} seconds! Next round!`);
        // Start new round immediately without resetting totalGuesses
        setTimeout(() => {
          setTargetWord(getRandomWord());
          setGuesses([]);
          setCurrentGuess("");
          setEvaluations([]);
          setLetterStatus({});
          // Reset hint state without showing extra messages
          setActiveHint(null);
          // Reset bot state for new word in timed mode
          if (botActive) {
            setBotState(getInitialBotState());
          }
        }, 1000);
        return;
      }

      // Handle classic/hard mode win
      setWon(true);
      setGameOver(true);

      // Count green letters
      const greenLetters = evaluation.filter(e => e === "correct").length;

      // Save game result to localStorage
      saveGameResult({
        mode: gameMode!,
        won: true,
        guesses: newGuesses.length,
        greenLetters,
        timestamp: Date.now(),
      });

      // Update database stats if user is logged in
      if (user) {
        updateStats(gameMode!, true, greenLetters);
      }

      setTimeout(() => {
        toast.success("Congratulations! 🎉");
        setShowResult(true);
      }, 1500);
      return;
    }

    // Check lose condition for classic/hard modes
    if (newGuesses.length >= maxGuesses) {
      setGameOver(true);

      // Count green letters in last guess
      const greenLetters = evaluation.filter(e => e === "correct").length;

      // Save game result to localStorage
      if (gameMode) {
        saveGameResult({
          mode: gameMode,
          won: false,
          guesses: newGuesses.length,
          greenLetters,
          timestamp: Date.now(),
        });
      }

      // Update database stats if user is logged in
      if (user && gameMode) {
        updateStats(gameMode, false, greenLetters);
      }

      setTimeout(() => {
        toast.error(`The word was ${targetWord}`);
        setShowResult(true);
      }, 1500);
    }
  }, [currentGuess, guesses, evaluations, targetWord, gameOver, gameMode, maxGuesses]);

  // Keep ref updated with the latest handleEnter
  useEffect(() => {
    handleEnterRef.current = handleEnter;
  }, [handleEnter]);

  const handlePlayAgain = () => {
    setTargetWord(getRandomWord());
    setGuesses([]);
    setCurrentGuess("");
    setEvaluations([]);
    setLetterStatus({});
    setGameOver(false);
    setWon(false);
    setShowResult(false);
    setActiveHint(null);
    setBotActive(false);
    setBotState(getInitialBotState());
    if (gameMode === "timed") {
      setTimeLeft(TIMED_INITIAL_SECONDS);
      setWordsCompleted(0);
      setTotalGuesses(0);
      setTimedGameActive(true);
    }
    toast.success("New game started!");
  };

  const handleBackToMenu = () => {
    window.history.replaceState({}, "", "/");
    setGameMode(null);
    setGuesses([]);
    setCurrentGuess("");
    setEvaluations([]);
    setLetterStatus({});
    setGameOver(false);
    setWon(false);
    setShowResult(false);
    setTimeLeft(TIMED_INITIAL_SECONDS);
    setWordsCompleted(0);
    setTotalGuesses(0);
    setTimedGameActive(false);
    setActiveHint(null);
    setBotActive(false);
    setBotState(getInitialBotState());
  };

  const handleHint = (e?: React.MouseEvent) => {
    if (gameOver || gameMode === "hard") return;

    // Blur the button to prevent Enter key from re-triggering it
    if (e?.currentTarget instanceof HTMLElement) {
      e.currentTarget.blur();
    }

    // Check if hints are available for this turn
    if (guesses.length === 0) {
      toast.error("Make your first guess to unlock hints!");
      return;
    }
    
    if (isHintActiveThisTurn) {
      toast.error("You can only use one hint per guess! Make another guess first.");
      return;
    }

    // Find positions that haven't been guessed correctly yet
    const correctPositions = new Set<number>();
    evaluations.forEach(evaluation => {
      evaluation.forEach((status, index) => {
        if (status === "correct") {
          correctPositions.add(index);
        }
      });
    });

    // Find available positions to reveal (not correct and not already hinted)
    const availablePositions = [];
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (!correctPositions.has(i)) {
        availablePositions.push(i);
      }
    }

    if (availablePositions.length === 0) {
      toast.info("All letters are already revealed!");
      return;
    }

    // Pick a random position to reveal
    const randomIndex = Math.floor(Math.random() * availablePositions.length);
    const positionToReveal = availablePositions[randomIndex];

    setActiveHint({
      turn: currentTurn,
      position: positionToReveal,
    });
    toast.success(`Hint revealed: "${targetWord[positionToReveal].toUpperCase()}"`);
  };

  const handleSelectMode = (mode: GameMode) => {
    setGameMode(mode);
    setTargetWord(getRandomWord());
    if (mode === "timed") {
      setTimedGameActive(true);
      setTimeLeft(TIMED_INITIAL_SECONDS);
    }
  };

  const handleToggleBot = () => {
    if (gameOver) {
      toast.error("Game is over! Start a new game to use the bot.");
      return;
    }

    if (!botActive) {
      // Show difficulty picker instead of immediately activating
      setShowBotDifficultyModal(true);
    } else {
      setBotActive(false);
      toast.info("Bot deactivated.");
    }
  };

  const handleSelectBotDifficulty = (difficulty: BotDifficulty) => {
    setBotDifficulty(difficulty);
    setBotActive(true);
    setShowBotDifficultyModal(false);
    const labels = { easy: "Easy", medium: "Medium", hard: "Hard" };
    toast.success(`Bot activated on ${labels[difficulty]} difficulty!`);
  };

  // Bot auto-play effect
  useEffect(() => {
    if (!botActive || gameOver || gameMode === null) return;

    const makeGuess = () => {
      const isHardMode = gameMode === "hard";

      // If this is the first guess, make a random guess
      if (guesses.length === 0) {
        const nextGuess = getBotNextGuess(botState, isHardMode);
        if (nextGuess) {
          setCurrentGuess(nextGuess);
          setTimeout(() => handleEnterRef.current(), 500);
        }
        return;
      }

      // Update bot state with last guess evaluation
      const lastGuess = guesses[guesses.length - 1];
      const lastEvaluation = evaluations[evaluations.length - 1];
      const newBotState = updateBotState(botState, lastGuess, lastEvaluation);
      setBotState(newBotState);

      // Get next guess from bot
      const nextGuess = getBotNextGuess(newBotState, isHardMode);
      if (nextGuess) {
        setCurrentGuess(nextGuess);
        setTimeout(() => handleEnterRef.current(), 500);
      } else {
        toast.error("Bot couldn't find a valid word!");
        setBotActive(false);
      }
    };

    // Delay between guesses to make it visible
    const timer = setTimeout(makeGuess, 1500);
    return () => clearTimeout(timer);
  }, [botActive, guesses, evaluations, gameOver, gameMode]);

  // Timed mode timer
  useEffect(() => {
    if (gameMode === "timed" && timedGameActive && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setGameOver(true);
            setTimedGameActive(false);

            // Count green letters in last evaluation
            const lastEvaluation = evaluations[evaluations.length - 1] || [];
            const greenLetters = lastEvaluation.filter(e => e === "correct").length;

            // Save timed mode result to localStorage
            saveGameResult({
              mode: "timed",
              won: wordsCompleted > 0,
              guesses: totalGuesses,
              wordsCompleted: wordsCompleted,
              greenLetters,
              timestamp: Date.now(),
            });

            // Update database stats if user is logged in
            if (user) {
              updateStats("timed", wordsCompleted > 0, greenLetters);
            }

            setTimeout(() => {
              toast.error(`Time's up! You completed ${wordsCompleted} word${wordsCompleted !== 1 ? 's' : ''}!`);
              setShowResult(true);
            }, 500);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameMode, timedGameActive, timeLeft, wordsCompleted]);

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

  const handleResumeGame = (gameId: string) => {
    // Set URL params and switch to multiplayer mode
    window.history.replaceState({}, '', `/?mode=multiplayer&game=${gameId}`);
    setGameMode("multiplayer");
  };

  if (user && !user.username?.trim()) {
    return <UsernameSetupScreen email={user.email} googleName={user.googleName} />;
  }

  if (!gameMode) {
    return (
      <>
        <GameMenu
          onSelectMode={handleSelectMode}
          onShowLeaderboard={() => setShowLeaderboard(true)}
          onResumeGame={handleResumeGame}
        />
        <Leaderboard open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
      </>
    );
  }

  if (gameMode === "multiplayer") {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Loading multiplayer...</p>
          </div>
        </div>
      }>
        <MultiplayerGame onBackToMenu={handleBackToMenu} />
      </Suspense>
    );
  }

  if (botActive) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Loading bot game...</p>
          </div>
        </div>
      }>
        <BotGame
          onBackToMenu={handleBackToMenu}
          gameMode={gameMode === "hard" ? "hard" : gameMode === "timed" ? "timed" : "classic"}
          botDifficulty={botDifficulty}
        />
      </Suspense>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <GameHeader
        onShowHelp={() => setShowHelp(true)}
        onShowStats={() => setShowLeaderboard(true)}
        onHint={handleHint}
        availableHints={!isHintActiveThisTurn && guesses.length > 0 ? 1 : 0}
        hintsDisabled={gameMode === "hard" || gameOver}
        onToggleBot={handleToggleBot}
        botActive={botActive}
        botDisabled={gameOver}
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 py-2 border-b gap-2 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={handleBackToMenu} className="h-8">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="text-xs sm:text-sm">Menu</span>
        </Button>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
          <span className="font-medium capitalize">{gameMode} Mode</span>
          {gameMode === "timed" && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Trophy className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                <span className="font-bold">{wordsCompleted} words</span>
              </div>
              <span className="hidden sm:inline">|</span>
              <span className="font-bold">{totalGuesses} guesses</span>
              <span className="hidden sm:inline">|</span>
              <span className={`font-bold ${timeLeft <= 10 ? 'text-destructive' : ''}`}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center gap-2 sm:gap-4 py-1 sm:py-2 px-2 sm:px-4 min-h-0 overflow-hidden">
        <div className="w-full flex items-center justify-center min-h-0 overflow-hidden">
          <GameGrid
            guesses={guesses}
            currentGuess={currentGuess}
            evaluations={evaluations}
            maxGuesses={maxGuesses}
            wordLength={WORD_LENGTH}
            shake={shake}
            revealedHints={activeHintPosition !== null ? [activeHintPosition] : []}
            hintActivated={isHintActiveThisTurn}
            targetWord={targetWord}
          />
        </div>

        <div className="flex-shrink-0 w-full flex justify-center pb-1">
          <Keyboard
            onKeyPress={handleKeyPress}
            onEnter={handleEnter}
            onDelete={handleDelete}
            letterStatus={letterStatus}
          />
        </div>
      </main>

      <ResultModal
        open={showResult}
        onClose={() => setShowResult(false)}
        won={won}
        word={targetWord}
        guesses={gameMode === "timed" ? totalGuesses : guesses.length}
        onPlayAgain={handlePlayAgain}
      />

      <HelpModal
        open={showHelp}
        onClose={() => setShowHelp(false)}
      />

      <Leaderboard
        open={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />

      {/* Bot Difficulty Selection Modal */}
      <Dialog open={showBotDifficultyModal} onOpenChange={setShowBotDifficultyModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold">Choose Bot Difficulty</DialogTitle>
            <DialogDescription className="text-center">
              How tough do you want your opponent?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {/* Easy */}
            <Card
              className={cn(
                "p-3 cursor-pointer border-2 transition-all duration-200",
                "hover:border-green-500 hover:bg-green-500/5 hover:-translate-y-0.5"
              )}
              onClick={() => handleSelectBotDifficulty("easy")}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <Target className="w-6 h-6 text-green-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-green-400">Easy</h3>
                </div>
              </div>
            </Card>

            {/* Medium */}
            <Card
              className={cn(
                "p-3 cursor-pointer border-2 transition-all duration-200",
                "hover:border-amber-500 hover:bg-amber-500/5 hover:-translate-y-0.5"
              )}
              onClick={() => handleSelectBotDifficulty("medium")}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-amber-400">Medium</h3>
                </div>
              </div>
            </Card>

            {/* Hard */}
            <Card
              className={cn(
                "p-3 cursor-pointer border-2 transition-all duration-200",
                "hover:border-red-500 hover:bg-red-500/5 hover:-translate-y-0.5"
              )}
              onClick={() => handleSelectBotDifficulty("hard")}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Brain className="w-6 h-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-red-400">Hard</h3>
                </div>
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;

