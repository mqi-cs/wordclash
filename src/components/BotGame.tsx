import { useState, useEffect, useCallback } from "react";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, User, Crown } from "lucide-react";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getInitialBotState, updateBotState, getBotNextGuess, BotState } from "@/lib/wordleBot";
import { saveGameResult } from "@/lib/gameHistory";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

interface BotGameProps {
  onBackToMenu: () => void;
  gameMode: "classic" | "hard";
}

export const BotGame = ({ onBackToMenu, gameMode }: BotGameProps) => {
  const [targetWord] = useState(() => getRandomWord());
  
  // Player game state
  const [myGuesses, setMyGuesses] = useState<string[]>([]);
  const [myCurrentGuess, setMyCurrentGuess] = useState("");
  const [myEvaluations, setMyEvaluations] = useState<Array<Array<"correct" | "present" | "absent">>>([]);
  const [myLetterStatus, setMyLetterStatus] = useState<Record<string, "correct" | "present" | "absent">>({});
  const [myGameOver, setMyGameOver] = useState(false);
  const [myWon, setMyWon] = useState(false);
  const [shake, setShake] = useState(false);
  
  // Bot game state
  const [botGuesses, setBotGuesses] = useState<string[]>([]);
  const [botEvaluations, setBotEvaluations] = useState<Array<Array<"correct" | "present" | "absent">>>([]);
  const [botGameOver, setBotGameOver] = useState(false);
  const [botWon, setBotWon] = useState(false);
  const [botState, setBotState] = useState<BotState>(getInitialBotState());
  const [botThinking, setBotThinking] = useState(false);
  
  const [waitingForBot, setWaitingForBot] = useState(false);

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
      guessLetters.forEach((letter, i) => {
        if (result[i] !== "correct") {
          result[i] = "absent";
        }
      });
    }

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
      if (myGameOver || myCurrentGuess.length >= WORD_LENGTH || waitingForBot) return;
      setMyCurrentGuess((prev) => prev + key);
    },
    [myGameOver, myCurrentGuess, waitingForBot]
  );

  const handleDelete = useCallback(() => {
    if (myGameOver || waitingForBot) return;
    setMyCurrentGuess((prev) => prev.slice(0, -1));
  }, [myGameOver, waitingForBot]);

  const handleEnter = useCallback(() => {
    if (myGameOver || waitingForBot) return;

    // Check if both are on the same row
    if (myGuesses.length !== botGuesses.length) {
      toast.info("Wait for the bot to complete its turn!");
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

    // Check win condition
    if (myCurrentGuess === targetWord) {
      setMyWon(true);
      setMyGameOver(true);
      setBotGameOver(true);
      
      const greenLetters = evaluation.filter(e => e === "correct").length;
      saveGameResult({
        mode: gameMode,
        won: true,
        guesses: newGuesses.length,
        greenLetters,
        timestamp: Date.now(),
      });
      
      toast.success("You won! 🎉");
      return;
    }

    // Check lose condition
    if (newGuesses.length >= MAX_GUESSES) {
      setMyGameOver(true);
      const greenLetters = evaluation.filter(e => e === "correct").length;
      
      // Wait to see if bot wins
      setWaitingForBot(true);
      return;
    }

    // Trigger bot turn
    setWaitingForBot(true);
  }, [myCurrentGuess, myGuesses, myEvaluations, targetWord, myGameOver, botGuesses.length, gameMode, waitingForBot]);

  // Bot turn effect
  useEffect(() => {
    if (!waitingForBot || myGameOver || botGameOver) return;
    if (myGuesses.length <= botGuesses.length) return; // Bot's turn only after player moves

    setBotThinking(true);

    const makeBotGuess = () => {
      const isHardMode = gameMode === "hard";
      
      let currentBotState = botState;
      
      // Update bot state if there are previous guesses
      if (botGuesses.length > 0) {
        const lastGuess = botGuesses[botGuesses.length - 1];
        const lastEvaluation = botEvaluations[botEvaluations.length - 1];
        currentBotState = updateBotState(botState, lastGuess, lastEvaluation);
        setBotState(currentBotState);
      }

      // Get next guess
      const nextGuess = getBotNextGuess(currentBotState, isHardMode);
      
      if (!nextGuess) {
        toast.error("Bot couldn't find a valid word!");
        setBotGameOver(true);
        setMyGameOver(true);
        setMyWon(true);
        setBotThinking(false);
        setWaitingForBot(false);
        return;
      }

      const evaluation = evaluateGuess(nextGuess, targetWord);
      const newBotGuesses = [...botGuesses, nextGuess];
      const newBotEvaluations = [...botEvaluations, evaluation];
      
      setBotGuesses(newBotGuesses);
      setBotEvaluations(newBotEvaluations);
      setBotThinking(false);
      setWaitingForBot(false);

      // Check if bot won
      if (nextGuess === targetWord) {
        setBotWon(true);
        setBotGameOver(true);
        setMyGameOver(true);
        
        const greenLetters = myEvaluations[myEvaluations.length - 1]?.filter(e => e === "correct").length || 0;
        saveGameResult({
          mode: gameMode,
          won: false,
          guesses: myGuesses.length,
          greenLetters,
          timestamp: Date.now(),
        });
        
        toast.error("Bot won! 🤖");
        return;
      }

      // Check if both lost
      if (newBotGuesses.length >= MAX_GUESSES && myGuesses.length >= MAX_GUESSES) {
        setMyGameOver(true);
        setBotGameOver(true);
        
        const greenLetters = myEvaluations[myEvaluations.length - 1]?.filter(e => e === "correct").length || 0;
        saveGameResult({
          mode: gameMode,
          won: false,
          guesses: myGuesses.length,
          greenLetters,
          timestamp: Date.now(),
        });
        
        toast.error(`Nobody won! The word was ${targetWord}`);
      }
    };

    // Add delay to simulate bot thinking
    const timer = setTimeout(makeBotGuess, 1500);
    return () => clearTimeout(timer);
  }, [waitingForBot, myGuesses.length, botGuesses.length, myGameOver, botGameOver, targetWord, gameMode, botState, botGuesses, botEvaluations, myEvaluations]);

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
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Button variant="ghost" size="sm" onClick={onBackToMenu}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Menu
        </Button>
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-bold capitalize">{gameMode} vs Bot</span>
        </div>
        <div className="w-20" />
      </div>
      
      <main className="flex-1 grid md:grid-cols-2 gap-2 p-2 md:p-4">
        {/* Player Side */}
        <Card className={cn(
          "flex flex-col items-center justify-between p-2 md:p-4 border-2 transition-all",
          myWon && "border-green-500 bg-green-500/5"
        )}>
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="flex items-center gap-2">
              {myWon && <Crown className="w-5 h-5 text-yellow-500" />}
              <User className="w-4 h-4" />
              <span className="text-sm md:text-base font-bold">You</span>
            </div>
            {waitingForBot && (
              <span className="text-xs text-muted-foreground animate-pulse">
                Bot is thinking...
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

        {/* Bot Side */}
        <Card className={cn(
          "flex flex-col items-center justify-start p-2 md:p-4 border-2 transition-all",
          botWon && "border-red-500 bg-red-500/5"
        )}>
          <div className="flex items-center gap-2 mb-2">
            {botWon && <Crown className="w-5 h-5 text-yellow-500" />}
            <Bot className="w-4 h-4" />
            <span className="text-sm md:text-base font-bold">Bot</span>
            {botThinking && (
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <div className="flex flex-col gap-1 my-4">
            {Array.from({ length: MAX_GUESSES }).map((_, rowIndex) => {
              const guess = botGuesses[rowIndex];
              const evaluation = botEvaluations[rowIndex];
              
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
                        style={hasGuess && !myGameOver ? { filter: "blur(8px)" } : undefined}
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
