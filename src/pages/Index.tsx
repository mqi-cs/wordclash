import { useState, useEffect, useCallback } from "react";
import { GameHeader } from "@/components/GameHeader";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { ResultModal, HelpModal } from "@/components/GameModal";
import { GameMenu, GameMode } from "@/components/GameMenu";
import { MultiplayerGame } from "@/components/MultiplayerGame";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy } from "lucide-react";
import { Leaderboard } from "@/components/Leaderboard";
import { saveGameResult } from "@/lib/gameHistory";
import { getInitialBotState, updateBotState, getBotNextGuess, BotState } from "@/lib/wordleBot";

const WORD_LENGTH = 5;
const CLASSIC_GUESSES = 6;
const HARD_GUESSES = 10;
const TIMED_INITIAL_SECONDS = 90;
const TIMED_BONUS_SECONDS = 30;

const Index = () => {
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
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
  const [revealedHints, setRevealedHints] = useState<number[]>([]);
  const [availableHints, setAvailableHints] = useState(0);
  
  // Bot state
  const [botActive, setBotActive] = useState(false);
  const [botState, setBotState] = useState<BotState>(getInitialBotState());
  
  // Timed mode state
  const [timeLeft, setTimeLeft] = useState(TIMED_INITIAL_SECONDS);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [timedGameActive, setTimedGameActive] = useState(false);
  const [totalGuesses, setTotalGuesses] = useState(0);

  const maxGuesses = gameMode === "hard" ? HARD_GUESSES : gameMode === "timed" ? 999 : CLASSIC_GUESSES;

  const evaluateGuess = (guess: string, target: string) => {
    const result: Array<"correct" | "present" | "absent"> = [];
    const targetLetters = target.split("");
    const guessLetters = guess.split("");

    // First pass: mark correct letters
    guessLetters.forEach((letter, i) => {
      if (letter === targetLetters[i]) {
        result[i] = "correct";
        targetLetters[i] = "";
      }
    });

    // Second pass: mark present letters (skip for hard mode)
    if (gameMode !== "hard") {
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
    } else {
      // Hard mode: only correct or absent
      guessLetters.forEach((letter, i) => {
        if (result[i] !== "correct") {
          result[i] = "absent";
        }
      });
    }

    return result;
  };

  const updateLetterStatus = (guess: string, evaluation: Array<"correct" | "present" | "absent">) => {
    const newStatus = { ...letterStatus };
    guess.split("").forEach((letter, i) => {
      const currentStatus = newStatus[letter];
      const newLetterStatus = evaluation[i];
      
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

    const evaluation = evaluateGuess(currentGuess, targetWord);
    updateLetterStatus(currentGuess, evaluation);
    
    const newGuesses = [...guesses, currentGuess];
    const newEvaluations = [...evaluations, evaluation];
    
    setGuesses(newGuesses);
    setEvaluations(newEvaluations);
    setCurrentGuess("");
    
    // Track total guesses in timed mode
    if (gameMode === "timed") {
      setTotalGuesses(prev => prev + 1);
    }
    
    // Grant one hint after each guess (except in hard mode)
    if (gameMode !== "hard") {
      setAvailableHints(prev => prev + 1);
    }

    // Check win condition
    if (currentGuess === targetWord) {
      // Handle timed mode - continue with unlimited wordles until time runs out
      if (gameMode === "timed") {
        setWordsCompleted(prev => prev + 1);
        setTimeLeft(prev => prev + TIMED_BONUS_SECONDS);
        toast.success(`+${TIMED_BONUS_SECONDS} seconds! Next word!`);
        // Start new word immediately without resetting totalGuesses
        setTimeout(() => {
          setTargetWord(getRandomWord());
          setGuesses([]);
          setCurrentGuess("");
          setEvaluations([]);
          setLetterStatus({});
          setRevealedHints([]);
          setAvailableHints(0);
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
      
      // Save game result
      saveGameResult({
        mode: gameMode!,
        won: true,
        guesses: newGuesses.length,
        greenLetters,
        timestamp: Date.now(),
      });
      
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
      
      // Save game result
      if (gameMode) {
        saveGameResult({
          mode: gameMode,
          won: false,
          guesses: newGuesses.length,
          greenLetters,
          timestamp: Date.now(),
        });
      }
      
      setTimeout(() => {
        toast.error(`The word was ${targetWord}`);
        setShowResult(true);
      }, 1500);
    }
  }, [currentGuess, guesses, evaluations, targetWord, gameOver, gameMode, maxGuesses]);

  const handlePlayAgain = () => {
    setTargetWord(getRandomWord());
    setGuesses([]);
    setCurrentGuess("");
    setEvaluations([]);
    setLetterStatus({});
    setGameOver(false);
    setWon(false);
    setShowResult(false);
    setRevealedHints([]);
    setAvailableHints(0);
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
    setRevealedHints([]);
    setAvailableHints(0);
    setBotActive(false);
    setBotState(getInitialBotState());
  };

  const handleHint = () => {
    if (gameOver || gameMode === "hard") return;
    
    // Check if hints are available
    if (availableHints === 0) {
      if (guesses.length === 0) {
        toast.error("Make your first guess to unlock hints!");
      } else {
        toast.error("No hints available! Make another guess to earn a hint.");
      }
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
      if (!correctPositions.has(i) && !revealedHints.includes(i)) {
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
    
    setRevealedHints(prev => [...prev, positionToReveal]);
    setAvailableHints(prev => prev - 1);
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
      setBotActive(true);
      toast.success("Bot activated! It will make guesses automatically.");
    } else {
      setBotActive(false);
      toast.info("Bot deactivated.");
    }
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
          setTimeout(() => handleEnter(), 500);
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
        setTimeout(() => handleEnter(), 500);
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
            
            // Save timed mode result
            saveGameResult({
              mode: "timed",
              won: wordsCompleted > 0,
              guesses: totalGuesses,
              wordsCompleted: wordsCompleted,
              greenLetters,
              timestamp: Date.now(),
            });
            
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

  if (!gameMode) {
    return (
      <>
        <GameMenu onSelectMode={handleSelectMode} onShowLeaderboard={() => setShowLeaderboard(true)} />
        <Leaderboard open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
      </>
    );
  }

  if (gameMode === "multiplayer") {
    return <MultiplayerGame onBackToMenu={handleBackToMenu} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GameHeader 
        onShowHelp={() => setShowHelp(true)}
        onShowStats={() => setShowLeaderboard(true)}
        onHint={handleHint}
        availableHints={availableHints}
        hintsDisabled={gameMode === "hard" || gameOver}
        onToggleBot={handleToggleBot}
        botActive={botActive}
        botDisabled={gameOver}
      />
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 py-2 border-b gap-2">
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
      
      <main className="flex-1 flex flex-col items-center justify-start pt-2 sm:pt-4 pb-4 sm:pb-8 px-2 sm:px-4">
        <GameGrid
          guesses={guesses}
          currentGuess={currentGuess}
          evaluations={evaluations}
          maxGuesses={maxGuesses}
          wordLength={WORD_LENGTH}
          shake={shake}
          revealedHints={revealedHints}
          targetWord={targetWord}
        />
        
        <Keyboard
          onKeyPress={handleKeyPress}
          onEnter={handleEnter}
          onDelete={handleDelete}
          letterStatus={letterStatus}
        />
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
    </div>
  );
};

export default Index;
