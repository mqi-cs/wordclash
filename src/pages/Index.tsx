import { useState, useEffect, useCallback } from "react";
import { GameHeader } from "@/components/GameHeader";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { ResultModal, HelpModal } from "@/components/GameModal";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

const Index = () => {
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

    // Second pass: mark present letters
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

    // Check lose condition
    if (newGuesses.length >= MAX_GUESSES) {
      setGameOver(true);
      setTimeout(() => {
        toast.error(`The word was ${targetWord}`);
        setShowResult(true);
      }, 1500);
    }
  }, [currentGuess, guesses, evaluations, targetWord, gameOver]);

  const handlePlayAgain = () => {
    setTargetWord(getRandomWord());
    setGuesses([]);
    setCurrentGuess("");
    setEvaluations([]);
    setLetterStatus({});
    setGameOver(false);
    setWon(false);
    setShowResult(false);
    toast.success("New game started!");
  };

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GameHeader 
        onShowHelp={() => setShowHelp(true)}
        onShowStats={() => setShowStats(true)}
      />
      
      <main className="flex-1 flex flex-col items-center justify-start pt-4 pb-8 px-4">
        <GameGrid
          guesses={guesses}
          currentGuess={currentGuess}
          evaluations={evaluations}
          maxGuesses={MAX_GUESSES}
          wordLength={WORD_LENGTH}
          shake={shake}
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
        guesses={guesses.length}
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
