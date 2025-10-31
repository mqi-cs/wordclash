import { useState, useEffect, useCallback } from "react";
import { GameHeader } from "@/components/GameHeader";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { ResultModal, HelpModal } from "@/components/GameModal";
import { GameMenu, GameMode } from "@/components/GameMenu";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy } from "lucide-react";

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
  const [revealedHints, setRevealedHints] = useState<number[]>([]);
  
  // Timed mode state
  const [timeLeft, setTimeLeft] = useState(TIMED_INITIAL_SECONDS);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [timedGameActive, setTimedGameActive] = useState(false);

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

    // Check win condition
    if (currentGuess === targetWord) {
      setWon(true);
      setGameOver(true);
      setTimeout(() => {
        toast.success("Congratulations! 🎉");
        setShowResult(true);
      }, 1500);
      return;
    }

    // Handle timed mode win
    if (gameMode === "timed" && currentGuess === targetWord) {
      setWordsCompleted(prev => prev + 1);
      setTimeLeft(prev => prev + TIMED_BONUS_SECONDS);
      toast.success(`+${TIMED_BONUS_SECONDS} seconds! Next word!`);
      // Start new word immediately
      setTimeout(() => {
        setTargetWord(getRandomWord());
        setGuesses([]);
        setCurrentGuess("");
        setEvaluations([]);
        setLetterStatus({});
        setGameOver(false);
        setWon(false);
      }, 1000);
      return;
    }

    // Check lose condition for classic/hard modes
    if (gameMode !== "timed" && newGuesses.length >= maxGuesses) {
      setGameOver(true);
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
    if (gameMode === "timed") {
      setTimeLeft(TIMED_INITIAL_SECONDS);
      setWordsCompleted(0);
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
    setTimedGameActive(false);
    setRevealedHints([]);
  };

  const handleHint = () => {
    if (gameOver) return;
    
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
      toast.info("No more hints available!");
      return;
    }

    // Pick a random position to reveal
    const randomIndex = Math.floor(Math.random() * availablePositions.length);
    const positionToReveal = availablePositions[randomIndex];
    
    setRevealedHints(prev => [...prev, positionToReveal]);
    toast.success(`Hint: Letter ${positionToReveal + 1} is "${targetWord[positionToReveal]}"`);
  };

  const handleSelectMode = (mode: GameMode) => {
    setGameMode(mode);
    setTargetWord(getRandomWord());
    if (mode === "timed") {
      setTimedGameActive(true);
      setTimeLeft(TIMED_INITIAL_SECONDS);
    }
  };

  // Timed mode timer
  useEffect(() => {
    if (gameMode === "timed" && timedGameActive && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setGameOver(true);
            setTimedGameActive(false);
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
    return <GameMenu onSelectMode={handleSelectMode} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GameHeader 
        onShowHelp={() => setShowHelp(true)}
        onShowStats={() => setShowStats(true)}
        onHint={handleHint}
      />
      
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <Button variant="ghost" size="sm" onClick={handleBackToMenu}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Menu
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium capitalize">{gameMode} Mode</span>
          {gameMode === "timed" && (
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold">{wordsCompleted}</span>
              <span className="text-sm">|</span>
              <span className={`text-sm font-bold ${timeLeft <= 10 ? 'text-destructive' : ''}`}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>
      </div>
      
      <main className="flex-1 flex flex-col items-center justify-start pt-4 pb-8 px-4">
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
        guesses={gameMode === "timed" ? wordsCompleted : guesses.length}
        onPlayAgain={handlePlayAgain}
      />

      <HelpModal
        open={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </div>
  );
};

export default Index;
