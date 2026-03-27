import { useState, useEffect, useCallback } from "react";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, User, Crown } from "lucide-react";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getInitialBotState, updateBotState, getBotNextGuess, BotState } from "@/lib/wordClashBot";
import { saveGameResult } from "@/lib/gameHistory";
import { evaluateGuess } from "@/lib/gameLogic";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

interface BotGameProps {
  onBackToMenu: () => void;
  gameMode: "classic" | "hard" | "timed";
}

export const BotGame = ({ onBackToMenu, gameMode }: BotGameProps) => {
  const [targetWord, setTargetWord] = useState(() => getRandomWord());
  
  // Timed mode state
  const [playerWordsCompleted, setPlayerWordsCompleted] = useState(0);
  const [botWordsCompleted, setBotWordsCompleted] = useState(0);
  const [timeLeft, setTimeLeft] = useState(90);
  const [timedGameActive, setTimedGameActive] = useState(gameMode === "timed");
  
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
  const blurBotGuesses = gameMode === "classic" && !myGameOver;

  // evaluateGuess is now imported from @/lib/gameLogic

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

    const evaluation = evaluateGuess(myCurrentGuess, targetWord, gameMode);
    updateLetterStatus(myCurrentGuess, evaluation);
    
    const newGuesses = [...myGuesses, myCurrentGuess];
    const newEvaluations = [...myEvaluations, evaluation];
    
    setMyGuesses(newGuesses);
    setMyEvaluations(newEvaluations);
    setMyCurrentGuess("");

    // Check win condition
    if (myCurrentGuess === targetWord) {
      // Handle timed mode - continue with new word
      if (gameMode === "timed") {
        setPlayerWordsCompleted(prev => prev + 1);
        setTimeLeft(prev => prev + 30);
        toast.success("+30 seconds! Next word!");
        
        // Start new word for both
        setTimeout(() => {
          const newWord = getRandomWord();
          setTargetWord(newWord);
          setMyGuesses([]);
          setMyCurrentGuess("");
          setMyEvaluations([]);
          setMyLetterStatus({});
          setBotGuesses([]);
          setBotEvaluations([]);
          setBotState(getInitialBotState());
          setWaitingForBot(false);
        }, 1000);
        return;
      }
      
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
      if (gameMode === "timed") {
        // In timed mode, just wait for bot
        setWaitingForBot(true);
        return;
      }
      
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

      const evaluation = evaluateGuess(nextGuess, targetWord, gameMode);
      const newBotGuesses = [...botGuesses, nextGuess];
      const newBotEvaluations = [...botEvaluations, evaluation];
      
      setBotGuesses(newBotGuesses);
      setBotEvaluations(newBotEvaluations);
      setBotThinking(false);
      setWaitingForBot(false);

      // Check if bot won
      if (nextGuess === targetWord) {
        // Handle timed mode - continue with new word
        if (gameMode === "timed") {
          setBotWordsCompleted(prev => prev + 1);
          toast.info("Bot completed the word!");
          
          // Start new word for both
          setTimeout(() => {
            const newWord = getRandomWord();
            setTargetWord(newWord);
            setMyGuesses([]);
            setMyCurrentGuess("");
            setMyEvaluations([]);
            setMyLetterStatus({});
            setBotGuesses([]);
            setBotEvaluations([]);
            setBotState(getInitialBotState());
            setWaitingForBot(false);
          }, 1000);
          return;
        }
        
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
        if (gameMode === "timed") {
          // In timed mode, start new word
          toast.info("New word! Neither solved it.");
          setTimeout(() => {
            const newWord = getRandomWord();
            setTargetWord(newWord);
            setMyGuesses([]);
            setMyCurrentGuess("");
            setMyEvaluations([]);
            setMyLetterStatus({});
            setBotGuesses([]);
            setBotEvaluations([]);
            setBotState(getInitialBotState());
            setWaitingForBot(false);
          }, 1000);
          return;
        }
        
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

  // Timed mode timer
  useEffect(() => {
    if (gameMode === "timed" && timedGameActive && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setMyGameOver(true);
            setBotGameOver(true);
            setTimedGameActive(false);
            
            const winner = playerWordsCompleted > botWordsCompleted ? "player" : 
                          botWordsCompleted > playerWordsCompleted ? "bot" : "tie";
            
            const greenLetters = myEvaluations[myEvaluations.length - 1]?.filter(e => e === "correct").length || 0;
            saveGameResult({
              mode: "timed",
              won: winner === "player",
              guesses: myGuesses.length,
              wordsCompleted: playerWordsCompleted,
              greenLetters,
              timestamp: Date.now(),
            });
            
            setTimeout(() => {
              if (winner === "player") {
                toast.success(`You won! ${playerWordsCompleted} vs ${botWordsCompleted} words 🎉`);
              } else if (winner === "bot") {
                toast.error(`Bot won! ${botWordsCompleted} vs ${playerWordsCompleted} words 🤖`);
              } else {
                toast.info(`Tie! Both completed ${playerWordsCompleted} words`);
              }
            }, 500);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameMode, timedGameActive, timeLeft, playerWordsCompleted, botWordsCompleted, myEvaluations]);

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
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <span className="font-bold capitalize">{gameMode} vs Bot</span>
          </div>
          {gameMode === "timed" && (
            <div className="flex items-center gap-3 text-xs mt-1">
              <span className="font-bold">You: {playerWordsCompleted}</span>
              <span>|</span>
              <span className="font-bold">Bot: {botWordsCompleted}</span>
              <span>|</span>
              <span className={`font-bold ${timeLeft <= 10 ? 'text-destructive' : ''}`}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>
          )}
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
          <div className="w-full max-w-[350px] sm:max-w-[450px] mx-auto my-4">
            <GameGrid
              guesses={botGuesses}
              currentGuess=""
              evaluations={botEvaluations}
              maxGuesses={MAX_GUESSES}
              wordLength={WORD_LENGTH}
              isOpponent={true}
              blurCompletedGuesses={blurBotGuesses}
            />
          </div>
        </Card>
      </main>
    </div>
  );
};
