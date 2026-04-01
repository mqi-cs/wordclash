import { useState, useEffect, useCallback, useRef } from "react";
import { GameGrid } from "@/components/GameGrid";
import { Keyboard } from "@/components/Keyboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, User, Crown, Handshake } from "lucide-react";
import { getRandomWord, isValidWord } from "@/lib/wordList";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getInitialBotState,
  updateBotState,
  getBotNextGuess,
  BotState,
  BotDifficulty,
  BOT_THINKING_DELAY,
} from "@/lib/wordClashBot";
import { saveGameResult } from "@/lib/gameHistory";
import { evaluateGuess } from "@/lib/gameLogic";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

interface BotGameProps {
  onBackToMenu: () => void;
  gameMode: "classic" | "hard" | "timed";
  botDifficulty: BotDifficulty;
}

export const BotGame = ({ onBackToMenu, gameMode, botDifficulty }: BotGameProps) => {
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

  // Draw state
  const [isDraw, setIsDraw] = useState(false);

  // Pre-computed bot guess: bot computes its next guess while the player types
  const [precomputedGuess, setPrecomputedGuess] = useState<string | null>(null);
  const precomputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Pre-compute bot's next guess while the player types ---
  useEffect(() => {
    // Don't precompute if game is over, or if it's the very first turn (bot needs to just pick)
    if (myGameOver || botGameOver) return;

    // After each round completes (bot has guessed), pre-compute the next guess
    if (botGuesses.length > 0 && botGuesses.length === myGuesses.length) {
      // Both have same number of guesses — round is complete, precompute next bot guess
      const lastBotGuess = botGuesses[botGuesses.length - 1];
      const lastBotEval = botEvaluations[botEvaluations.length - 1];

      const updatedState = updateBotState(botState, lastBotGuess, lastBotEval);

      // Run precomputation asynchronously
      if (precomputeTimerRef.current) clearTimeout(precomputeTimerRef.current);

      precomputeTimerRef.current = setTimeout(() => {
        const isHardMode = gameMode === "hard";
        const nextGuess = getBotNextGuess(updatedState, isHardMode, botDifficulty, botGuesses.length);
        setPrecomputedGuess(nextGuess);
        setBotState(updatedState);
      }, 50); // Tiny delay to not block UI
    }

    return () => {
      if (precomputeTimerRef.current) clearTimeout(precomputeTimerRef.current);
    };
  }, [botGuesses.length, myGuesses.length, myGameOver, botGameOver]);

  const updateLetterStatus = (guess: string, evaluation: Array<"correct" | "present" | "absent">) => {
    const newStatus = { ...myLetterStatus };
    guess.split("").forEach((letter, i) => {
      const currentStatus = newStatus[letter];
      const newLetterStatus = evaluation[i];

      if (
        !currentStatus ||
        (currentStatus === "absent" && newLetterStatus !== "absent") ||
        (currentStatus === "present" && newLetterStatus === "correct")
      ) {
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

    // Check both are on the same row
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

    const playerSolvedThisRound = myCurrentGuess === targetWord;

    // In timed mode with player solve, handle specially after bot turn
    if (playerSolvedThisRound && gameMode !== "timed") {
      // Player solved, but DON'T end the game yet — let bot finish this round
      setMyWon(true);
    }

    if (playerSolvedThisRound && gameMode === "timed") {
      setPlayerWordsCompleted((prev) => prev + 1);
      setTimeLeft((prev) => prev + 30);
      toast.success("+30 seconds! Next word!");

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
        setPrecomputedGuess(null);
        setWaitingForBot(false);
      }, 1000);
      return;
    }

    // Trigger bot turn — bot must always finish its guess for this round
    setWaitingForBot(true);
  }, [myCurrentGuess, myGuesses, myEvaluations, targetWord, myGameOver, botGuesses.length, gameMode, waitingForBot]);

  // ─── Bot turn effect ─────────────────────────────────────────────────
  useEffect(() => {
    if (!waitingForBot || botGameOver) return;
    if (myGuesses.length <= botGuesses.length) return;

    setBotThinking(true);

    const thinkingDelay = BOT_THINKING_DELAY[botDifficulty];

    const makeBotGuess = () => {
      const isHardMode = gameMode === "hard";

      let nextGuess: string | null;

      if (botGuesses.length === 0) {
        // First guess — compute fresh
        nextGuess = getBotNextGuess(botState, isHardMode, botDifficulty, 0);
      } else if (precomputedGuess) {
        // Use the pre-computed guess
        nextGuess = precomputedGuess;
        setPrecomputedGuess(null);
      } else {
        // Fallback: compute now (if precomputation wasn't ready)
        const lastGuess = botGuesses[botGuesses.length - 1];
        const lastEval = botEvaluations[botEvaluations.length - 1];
        const updatedState = updateBotState(botState, lastGuess, lastEval);
        setBotState(updatedState);
        nextGuess = getBotNextGuess(updatedState, isHardMode, botDifficulty, botGuesses.length);
      }

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

      const botSolvedThisRound = nextGuess === targetWord;
      const playerSolvedThisRound = myWon; // Set earlier in handleEnter
      const bothMaxedOut = newBotGuesses.length >= MAX_GUESSES && myGuesses.length >= MAX_GUESSES;

      // ─── Determine round outcome ─────────────────────────────

      if (gameMode === "timed") {
        if (botSolvedThisRound) {
          setBotWordsCompleted((prev) => prev + 1);
          toast.info("Bot completed the word!");

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
            setPrecomputedGuess(null);
            setWaitingForBot(false);
          }, 1000);
        } else if (bothMaxedOut) {
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
            setPrecomputedGuess(null);
            setWaitingForBot(false);
          }, 1000);
        }
        return;
      }

      // Non-timed modes: Classic / Hard
      if (playerSolvedThisRound && botSolvedThisRound) {
        // DRAW — both solved on the same guess number
        setIsDraw(true);
        setMyGameOver(true);
        setBotGameOver(true);
        setBotWon(true);

        const greenLetters = 5; // both solved
        saveGameResult({
          mode: gameMode,
          won: false, // draw counts as not-won for stats
          guesses: myGuesses.length,
          greenLetters,
          timestamp: Date.now(),
        });

        toast("It's a draw! 🤝 Both solved it on the same guess!");
        return;
      }

      if (playerSolvedThisRound && !botSolvedThisRound) {
        // Player wins — bot had its chance and didn't solve it
        setMyGameOver(true);
        setBotGameOver(true);

        saveGameResult({
          mode: gameMode,
          won: true,
          guesses: myGuesses.length,
          greenLetters: 5,
          timestamp: Date.now(),
        });

        toast.success("You won! 🎉");
        return;
      }

      if (!playerSolvedThisRound && botSolvedThisRound) {
        // Bot wins
        setBotWon(true);
        setBotGameOver(true);
        setMyGameOver(true);

        const lastPlayerEval = myEvaluations[myEvaluations.length - 1];
        const greenLetters = lastPlayerEval?.filter((e) => e === "correct").length || 0;
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

      if (bothMaxedOut) {
        // Draw — neither solved within max guesses
        setIsDraw(true);
        setMyGameOver(true);
        setBotGameOver(true);

        const lastPlayerEval = myEvaluations[myEvaluations.length - 1];
        const greenLetters = lastPlayerEval?.filter((e) => e === "correct").length || 0;
        saveGameResult({
          mode: gameMode,
          won: false,
          guesses: myGuesses.length,
          greenLetters,
          timestamp: Date.now(),
        });

        toast(`Draw! Nobody guessed it. The word was ${targetWord}`, { icon: "🤝" });
      }
    };

    const timer = setTimeout(makeBotGuess, thinkingDelay);
    return () => clearTimeout(timer);
  }, [waitingForBot, myGuesses.length, botGuesses.length, botGameOver, targetWord, gameMode, botDifficulty, botState, precomputedGuess, myWon]);

  // ─── Timed mode timer ────────────────────────────────────────────────
  useEffect(() => {
    if (gameMode === "timed" && timedGameActive && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setMyGameOver(true);
            setBotGameOver(true);
            setTimedGameActive(false);

            const winner =
              playerWordsCompleted > botWordsCompleted
                ? "player"
                : botWordsCompleted > playerWordsCompleted
                  ? "bot"
                  : "tie";

            const greenLetters =
              myEvaluations[myEvaluations.length - 1]?.filter((e) => e === "correct").length || 0;
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
                toast(`Draw! Both completed ${playerWordsCompleted} words`, { icon: "🤝" });
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

  // ─── Physical keyboard events ────────────────────────────────────────
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

  // ─── Difficulty label & colour ───────────────────────────────────────
  const difficultyConfig = {
    easy: { label: "Easy", color: "text-green-400", bg: "bg-green-500/10" },
    medium: { label: "Medium", color: "text-amber-400", bg: "bg-amber-500/10" },
    hard: { label: "Hard", color: "text-red-400", bg: "bg-red-500/10" },
  };
  const diffCfg = difficultyConfig[botDifficulty];

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
            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", diffCfg.bg, diffCfg.color)}>
              {diffCfg.label}
            </span>
          </div>
          {gameMode === "timed" && (
            <div className="flex items-center gap-3 text-xs mt-1">
              <span className="font-bold">You: {playerWordsCompleted}</span>
              <span>|</span>
              <span className="font-bold">Bot: {botWordsCompleted}</span>
              <span>|</span>
              <span className={`font-bold ${timeLeft <= 10 ? "text-destructive" : ""}`}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
              </span>
            </div>
          )}
        </div>
        <div className="w-20" />
      </div>

      <main className="flex-1 grid md:grid-cols-2 gap-2 p-2 md:p-4">
        {/* Player Side */}
        <Card
          className={cn(
            "flex flex-col items-center justify-between p-2 md:p-4 border-2 transition-all",
            myWon && !isDraw && "border-green-500 bg-green-500/5",
            isDraw && "border-amber-400 bg-amber-400/5"
          )}
        >
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="flex items-center gap-2">
              {myWon && !isDraw && <Crown className="w-5 h-5 text-yellow-500" />}
              {isDraw && <Handshake className="w-5 h-5 text-amber-400" />}
              <User className="w-4 h-4" />
              <span className="text-sm md:text-base font-bold">You</span>
            </div>
            {waitingForBot && (
              <span className="text-xs text-muted-foreground animate-pulse">Bot is thinking...</span>
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
        <Card
          className={cn(
            "flex flex-col items-center justify-start p-2 md:p-4 border-2 transition-all",
            botWon && !isDraw && "border-red-500 bg-red-500/5",
            isDraw && "border-amber-400 bg-amber-400/5"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {botWon && !isDraw && <Crown className="w-5 h-5 text-yellow-500" />}
            {isDraw && <Handshake className="w-5 h-5 text-amber-400" />}
            <Bot className="w-4 h-4" />
            <span className="text-sm md:text-base font-bold">Bot</span>
            <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", diffCfg.bg, diffCfg.color)}>
              {diffCfg.label}
            </span>
            {botThinking && <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />}
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
