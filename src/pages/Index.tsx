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
import type { BotDifficulty } from "@/lib/wordClashBot";
import { useAuth } from "@/contexts/AuthContext";
import { evaluateGuess } from "@/lib/gameLogic";
import {
  consumeGuestDailyRound,
  DAILY_MODE_ROUND_LIMIT,
  getGuestDailyModeLimits,
  subscribeToGuestDailyModeLimits,
  type DailyModeLimits,
  type LimitedGameMode,
} from "@/lib/guestLimits";
import {
  abandonGuestLeaderboardRound,
  finishGuestLeaderboardRound,
  startGuestLeaderboardRound,
} from "@/lib/guestLeaderboard";
import { UsernameSetupScreen } from "@/components/UsernameSetupScreen";
import { OnboardingGuide } from "@/components/OnboardingGuide";
import { GuidedTour } from "@/components/GuidedTour";
import { hasSeenTour } from "@/lib/onboardingStorage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { getEquippedCosmeticThemeClassName, getEquippedCosmeticThemeClasses } from "@/lib/cosmetics";
import {
  getGuestCosmeticsState,
  recordGuestQuestProgress,
  subscribeToGuestCosmetics,
} from "@/lib/guestCosmetics";
import { FeatureWalkthroughDialog, WalkthroughSlide } from "@/components/FeatureWalkthrough";
import { InteractiveFeatureCoach } from "@/components/InteractiveFeatureCoach";
import { usePostHog } from "@/contexts/PostHogContext";
import { useStatsUpdate } from "@/hooks/useStatsUpdate";
import { getErrorMessage } from "@/lib/errors";

const MultiplayerGame = lazy(() => import("@/components/MultiplayerGame").then(module => ({ default: module.MultiplayerGame })));
const BotGame = lazy(() => import("@/components/BotGame").then(module => ({ default: module.BotGame })));

const WORD_LENGTH = 5;
const CLASSIC_GUESSES = 6;
const HARD_GUESSES = 10;
const TIMED_INITIAL_SECONDS = 75;
const TIMED_BONUS_SECONDS = 25;
const TIMED_HINT_PENALTY_SECONDS = 10;

type ActiveHint = {
  turn: number;
  // -1 for hard mode's letter elimination, which reveals no position.
  position: number;
  letter?: string;
};

type Evaluation = Array<"correct" | "present" | "absent">;
type LetterStatus = Record<string, "correct" | "present" | "absent">;
type SoloRoundState = FunctionReturnType<typeof api.soloRounds.start>;

// Keyboard colours only ever improve: absent < present < correct. Hard mode
// only reveals exact matches.
const mergeLetterStatus = (
  status: LetterStatus,
  guess: string,
  evaluation: Evaluation,
  mode: GameMode | null,
): LetterStatus => {
  const next = { ...status };
  guess.split("").forEach((letter, i) => {
    const currentStatus = next[letter];
    const newLetterStatus = evaluation[i];

    if (mode === "hard" && newLetterStatus !== "correct") {
      return;
    }

    if (!currentStatus ||
      (currentStatus === "absent" && newLetterStatus !== "absent") ||
      (currentStatus === "present" && newLetterStatus === "correct")) {
      next[letter] = newLetterStatus;
    }
  });
  return next;
};

type GameplayWalkthroughKey = "hints" | "wordBot";
type ClassicCoachPhase =
  | "inactive"
  | "intro"
  | "awaiting_first_guess"
  | "hint_button"
  | "hint_result"
  | "bot_button"
  | "bot_modal"
  | "complete";

type GameplayWalkthroughConfig = {
  slides: WalkthroughSlide[];
  actionLabel?: string;
};

const GAMEPLAY_WALKTHROUGH_STORAGE_KEY = "wordclash_gameplay_walkthroughs_v1";
const CLASSIC_COACH_STORAGE_KEY = "wordclash_classic_coach_v1";

const GAMEPLAY_WALKTHROUGH_CONFIG: Record<GameplayWalkthroughKey, GameplayWalkthroughConfig> = {
  hints: {
    slides: [
      {
        title: "Hints",
        subtitle: "Use them when the board gets sticky",
        description:
          "Hints are small nudges designed to keep you moving without solving the puzzle for you.",
        bullets: [
          "Hints unlock after your first guess.",
          "You can use one hint per turn.",
          "Hints behave differently depending on the mode.",
        ],
        accentVar: "menu-timed",
      },
      {
        title: "Mode-Specific Hint Behavior",
        subtitle: "Classic, Timed, and Hard differ",
        description:
          "WordClash uses the same button for different kinds of help depending on the ruleset.",
        bullets: [
          "Classic and Timed reveal a correct letter position.",
          "Hard Mode eliminates wrong letters from the keyboard instead.",
          "Hints are strongest when used after you've narrowed the possibilities.",
        ],
        accentVar: "menu-timed",
      },
    ],
    actionLabel: "Try Hint",
  },
  wordBot: {
    slides: [
      {
        title: "Word Bot",
        subtitle: "A rival built for Classic mode",
        description:
          "The Word Bot lets you race an AI opponent while you solve the same word on your own board.",
        bullets: [
          "The bot is available in Classic mode.",
          "It plays on a split-screen style race setup.",
          "You still control your own guesses normally.",
        ],
        accentVar: "menu-classic",
      },
      {
        title: "Difficulty and Feel",
        subtitle: "Pick the pressure level",
        description:
          "You choose how smart the bot feels before the race starts.",
        bullets: [
          "Easy is relaxed and forgiving.",
          "Medium is a balanced race.",
          "Hard pushes you to think faster and cleaner.",
        ],
        accentVar: "menu-classic",
      },
    ],
    actionLabel: "Open Word Bot",
  },
};

const DEFAULT_GAMEPLAY_WALKTHROUGHS: Record<GameplayWalkthroughKey, boolean> = {
  hints: false,
  wordBot: false,
};

const CLASSIC_INTRO_SLIDES: WalkthroughSlide[] = [
  {
    title: "Classic Mode",
    subtitle: "Your first real board",
    description:
      "Classic mode starts with the full game UI in place. You will guess on the grid, use the keyboard below, and learn from the feedback on every row.",
    bullets: [
      "The grid is where your guesses appear.",
      "The keyboard is how you build and submit words.",
      "Classic gives you 6 tries to solve the word.",
    ],
    accentVar: "menu-classic",
  },
  {
    title: "Make One Guess",
    subtitle: "We will guide the next steps",
    description:
      "Enter your first guess now. Right after that, WordClash will show you how hints and the word bot work with a short guided demonstration.",
    bullets: [
      "Type a 5-letter word and submit it.",
      "After the first guess, controls will pause briefly for the demo.",
      "Then you can continue playing normally.",
    ],
    accentVar: "menu-classic",
  },
];

const loadGameplayWalkthroughs = (): Record<GameplayWalkthroughKey, boolean> => {
  if (typeof window === "undefined") {
    return DEFAULT_GAMEPLAY_WALKTHROUGHS;
  }

  try {
    const raw = window.localStorage.getItem(GAMEPLAY_WALKTHROUGH_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_GAMEPLAY_WALKTHROUGHS;
    }

    const parsed = JSON.parse(raw) as Partial<Record<GameplayWalkthroughKey, boolean>>;
    return {
      ...DEFAULT_GAMEPLAY_WALKTHROUGHS,
      ...parsed,
    };
  } catch {
    return DEFAULT_GAMEPLAY_WALKTHROUGHS;
  }
};

const persistGameplayWalkthroughs = (state: Record<GameplayWalkthroughKey, boolean>) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GAMEPLAY_WALKTHROUGH_STORAGE_KEY, JSON.stringify(state));
};

const loadClassicCoachSeen = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(CLASSIC_COACH_STORAGE_KEY) === "true";
};

const persistClassicCoachSeen = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CLASSIC_COACH_STORAGE_KEY, "true");
};

const Index = () => {
  const { user } = useAuth();
  const captureUserEvent = useMutation(api.analyticsEvents.captureUserEvent);
  const startSoloRoundMut = useMutation(api.soloRounds.start);
  const submitSoloGuessMut = useMutation(api.soloRounds.submitGuess);
  const spendSoloHintMut = useMutation(api.soloRounds.spendHint);
  const finishTimedSoloRoundMut = useMutation(api.soloRounds.finishTimed);
  const { trackGame } = usePostHog();
  const { updateStats } = useStatsUpdate();
  const wallet = useQuery(api.cosmetics.getMyCosmetics, user ? {} : "skip");
  const signedInDailyModeLimits = useQuery(api.dailyLimits.getMyDailyRoundLimits, user ? {} : "skip");
  const [guestCosmeticsState, setGuestCosmeticsState] = useState(getGuestCosmeticsState);
  const [guestDailyModeLimits, setGuestDailyModeLimits] = useState<DailyModeLimits>(getGuestDailyModeLimits);
  const equippedCosmetics = user ? wallet?.equippedCosmetics : guestCosmeticsState.equippedCosmetics;
  const cosmeticThemeClassName = getEquippedCosmeticThemeClassName(equippedCosmetics);

  // Check for URL params to auto-start multiplayer
  const urlParams = new URLSearchParams(window.location.search);
  const joinGameId = urlParams.get('join') || urlParams.get('game');
  const modeParam = urlParams.get('mode');
  const initialMode = (joinGameId || modeParam === 'multiplayer') ? 'multiplayer' : null;

  const [gameMode, setGameMode] = useState<GameMode | null>(initialMode);
  const [showGuidedTour, setShowGuidedTour] = useState(() => !hasSeenTour());
  const [showHelpSlides, setShowHelpSlides] = useState(false);
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
  const [seenGameplayWalkthroughs, setSeenGameplayWalkthroughs] = useState<
    Record<GameplayWalkthroughKey, boolean>
  >(loadGameplayWalkthroughs);
  const [activeGameplayWalkthrough, setActiveGameplayWalkthrough] =
    useState<GameplayWalkthroughKey | null>(null);
  const [classicCoachSeen, setClassicCoachSeen] = useState(loadClassicCoachSeen);
  const [classicCoachPhase, setClassicCoachPhase] =
    useState<ClassicCoachPhase>("inactive");
  const [activeHint, setActiveHint] = useState<ActiveHint | null>(null);
  const [eliminatedLetters, setEliminatedLetters] = useState<string[]>([]);
  const [currentLeaderboardSlot, setCurrentLeaderboardSlot] = useState<number | null>(null);
  const [roundHintUses, setRoundHintUses] = useState(0);
  // Signed-in rounds are scored by the server, which only reveals the answer
  // once the round is over.
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
  const submittingGuessRef = useRef(false);

  // Bot state
  const [botActive, setBotActive] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("easy");
  const [showBotDifficultyModal, setShowBotDifficultyModal] = useState(false);

  // Ref to always access the latest handleEnter function from timeouts
  const handleEnterRef = useRef<() => void>(() => {});
  const pendingGameplayActionRef = useRef<(() => void) | null>(null);
  const classicCoachTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timed mode state
  const [timeLeft, setTimeLeft] = useState(TIMED_INITIAL_SECONDS);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [timedGameActive, setTimedGameActive] = useState(false);
  const [totalGuesses, setTotalGuesses] = useState(0);

  const maxGuesses = gameMode === "hard" ? HARD_GUESSES : gameMode === "timed" ? 999 : CLASSIC_GUESSES;
  const currentTurn = guesses.length;
  const isHintActiveThisTurn = activeHint?.turn === currentTurn;
  const activeHintLetters =
    isHintActiveThisTurn && activeHint.position >= 0 && activeHint.letter
      ? { [activeHint.position]: activeHint.letter }
      : {};
  const isServerRound = Boolean(user) && currentLeaderboardSlot !== null;
  const classicCoachBlocking =
    classicCoachPhase === "hint_button" ||
    classicCoachPhase === "hint_result" ||
    classicCoachPhase === "bot_button" ||
    classicCoachPhase === "bot_modal";

  useEffect(() => {
    if (user) return;
    setGuestCosmeticsState(getGuestCosmeticsState());
    return subscribeToGuestCosmetics(() => {
      setGuestCosmeticsState(getGuestCosmeticsState());
    });
  }, [user]);

  useEffect(() => {
    if (user) return;
    setGuestDailyModeLimits(getGuestDailyModeLimits());
    return subscribeToGuestDailyModeLimits(() => {
      setGuestDailyModeLimits(getGuestDailyModeLimits());
    });
  }, [user]);

  useEffect(() => {
    if (!activeHint || activeHint.turn === currentTurn) return;
    setActiveHint(null);
  }, [activeHint, currentTurn]);

  useEffect(() => {
    if (classicCoachTimerRef.current) {
      clearTimeout(classicCoachTimerRef.current);
      classicCoachTimerRef.current = null;
    }

    if (gameMode === "classic" && !classicCoachSeen) {
      setClassicCoachPhase("intro");
      return;
    }

    if (gameMode !== "classic") {
      setClassicCoachPhase("inactive");
    }
  }, [classicCoachSeen, gameMode]);

  useEffect(() => {
    return () => {
      if (classicCoachTimerRef.current) {
        clearTimeout(classicCoachTimerRef.current);
      }
    };
  }, []);

  // Apply cosmetics globally
  useEffect(() => {
    const cosmeticThemeClasses =
      gameMode === "multiplayer"
        ? []
        : getEquippedCosmeticThemeClasses(equippedCosmetics).filter(
            (className) => !className.startsWith("theme-bg-"),
          );
    const existingThemeClasses = Array.from(document.body.classList).filter((className) =>
      className.startsWith("theme-"),
    );
    if (existingThemeClasses.length > 0) {
      document.body.classList.remove(...existingThemeClasses);
    }
    if (cosmeticThemeClasses.length > 0) {
      document.body.classList.add(...cosmeticThemeClasses);
    }

    return () => {
      if (cosmeticThemeClasses.length > 0) {
        document.body.classList.remove(...cosmeticThemeClasses);
      }
    };
  }, [equippedCosmetics, gameMode]);

  const markGameplayWalkthroughSeen = (key: GameplayWalkthroughKey) => {
    setSeenGameplayWalkthroughs((prev) => {
      if (prev[key]) {
        return prev;
      }
      const next = { ...prev, [key]: true };
      persistGameplayWalkthroughs(next);
      return next;
    });
  };

  const openGameplayWalkthrough = (
    key: GameplayWalkthroughKey,
    action?: () => void,
  ) => {
    markGameplayWalkthroughSeen(key);
    pendingGameplayActionRef.current = action ?? null;
    setActiveGameplayWalkthrough(key);
  };

  const closeGameplayWalkthrough = () => {
    pendingGameplayActionRef.current = null;
    setActiveGameplayWalkthrough(null);
  };

  const handleGameplayWalkthroughPrimary = () => {
    const nextAction = pendingGameplayActionRef.current;
    closeGameplayWalkthrough();
    nextAction?.();
  };

  const finishClassicCoach = () => {
    if (classicCoachTimerRef.current) {
      clearTimeout(classicCoachTimerRef.current);
      classicCoachTimerRef.current = null;
    }
    setShowBotDifficultyModal(false);
    persistClassicCoachSeen();
    setClassicCoachSeen(true);
    setClassicCoachPhase("complete");
    setSeenGameplayWalkthroughs((prev) => {
      const next = { ...prev, hints: true, wordBot: true };
      persistGameplayWalkthroughs(next);
      return next;
    });
  };

  const scheduleClassicCoachPhase = (
    nextPhase: Exclude<ClassicCoachPhase, "intro" | "awaiting_first_guess" | "inactive" | "complete">,
    delayMs: number,
  ) => {
    if (classicCoachTimerRef.current) {
      clearTimeout(classicCoachTimerRef.current);
    }
    classicCoachTimerRef.current = setTimeout(() => {
      setClassicCoachPhase(nextPhase);
    }, delayMs);
  };



  const updateLetterStatus = useCallback(
    (guess: string, evaluation: Evaluation) => {
      setLetterStatus((prev) => mergeLetterStatus(prev, guess, evaluation, gameMode));
    },
    [gameMode],
  );

  // Restores a signed-in round from the server (a resumed round, or the
  // clock of a new timed round).
  const applySoloRoundState = (state: SoloRoundState, mode: LimitedGameMode) => {
    setCurrentLeaderboardSlot(state.slot);
    setRoundHintUses(state.hintUses);
    if (state.msRemaining !== null) {
      setTimeLeft(Math.ceil(state.msRemaining / 1000));
    }
    if (!state.resumed) {
      return;
    }
    setGuesses(state.guesses.map(({ guess }) => guess));
    setEvaluations(state.guesses.map(({ evaluation }) => evaluation));
    setLetterStatus(
      state.guesses.reduce<LetterStatus>(
        (status, { guess, evaluation }) => mergeLetterStatus(status, guess, evaluation, mode),
        {},
      ),
    );
    setEliminatedLetters(state.eliminatedLetters);
    setWordsCompleted(state.wordsCompleted);
    setTotalGuesses(state.totalGuesses);
  };

  // Signed-in players get the server's round state back, which the caller
  // applies once it has reset the board; guests track rounds locally.
  const startTrackedSoloRound = useCallback(
    async (mode: LimitedGameMode): Promise<SoloRoundState | null> => {
      setRevealedAnswer(null);
      setRoundHintUses(0);
      if (user) {
        return await startSoloRoundMut({ mode });
      }

      consumeGuestDailyRound(mode);
      setGuestDailyModeLimits(getGuestDailyModeLimits());
      const slot = startGuestLeaderboardRound(mode);
      setCurrentLeaderboardSlot(slot);
      return null;
    },
    [startSoloRoundMut, user],
  );

  const finalizeTrackedSoloRound = useCallback(
    (args: {
      mode: LimitedGameMode;
      won: boolean;
      greenLetters: number;
      rawGuesses?: number;
      wordsCompleted?: number;
    }) => {
      if (currentLeaderboardSlot === null) {
        return false;
      }

      const slot = currentLeaderboardSlot;
      const hintUses = args.mode === "timed" ? 0 : roundHintUses;

      if (user) {
        // The server recorded classic and hard rounds when it scored the
        // final guess; timed rounds end when the clock runs out here.
        if (args.mode === "timed") {
          void finishTimedSoloRoundMut({ slot })
            .then((result) => setRevealedAnswer(result.answer))
            .catch(() => {
              toast.error("We couldn't save this leaderboard result.");
            });
        }
      } else {
        finishGuestLeaderboardRound({
          mode: args.mode,
          slot,
          won: args.won,
          rawGuesses: args.rawGuesses,
          hintUses,
          wordsCompleted: args.wordsCompleted,
        });
      }

      setCurrentLeaderboardSlot(null);
      setRoundHintUses(0);
      // Recording a server round also records the player's stats.
      return !!user;
    },
    [currentLeaderboardSlot, finishTimedSoloRoundMut, roundHintUses, user],
  );

  const abandonTrackedSoloRound = useCallback(
    (mode: LimitedGameMode) => {
      if (currentLeaderboardSlot === null) {
        return;
      }

      // Signed-in rounds stay open on the server and resume next time the
      // mode is picked; only local guest rounds are abandoned.
      if (!user) {
        abandonGuestLeaderboardRound(mode, currentLeaderboardSlot);
      }

      setCurrentLeaderboardSlot(null);
      setRoundHintUses(0);
    },
    [currentLeaderboardSlot, user],
  );

  const handleKeyPress = useCallback(
    (key: string) => {
      if (gameOver || submittingGuessRef.current || currentGuess.length >= WORD_LENGTH) return;
      setCurrentGuess((prev) => prev + key);
    },
    [gameOver, currentGuess]
  );

  const handleDelete = useCallback(() => {
    if (gameOver || submittingGuessRef.current) return;
    setCurrentGuess((prev) => prev.slice(0, -1));
  }, [gameOver]);

  const endTimedGame = useCallback(() => {
    setGameOver(true);
    setTimedGameActive(false);

    const lastEvaluation = evaluations[evaluations.length - 1] || [];
    const greenLetters = lastEvaluation.filter(e => e === "correct").length;

    saveGameResult({
      mode: "timed",
      won: wordsCompleted > 0,
      guesses: totalGuesses,
      wordsCompleted,
      greenLetters,
      timestamp: Date.now(),
    });

    if (user) {
      const recorded = finalizeTrackedSoloRound({
        mode: "timed",
        won: wordsCompleted > 0,
        greenLetters,
        wordsCompleted,
      });
      if (!recorded) {
        void updateStats("timed", wordsCompleted > 0, greenLetters, undefined, "solo");
      }
    } else {
      finalizeTrackedSoloRound({
        mode: "timed",
        won: wordsCompleted > 0,
        greenLetters,
        wordsCompleted,
      });
      recordGuestQuestProgress("timed", {
        won: wordsCompleted > 0,
        greenLetters,
      });
      trackGame("game_completed", {
        mode: "timed",
        won: wordsCompleted > 0,
        words_completed: wordsCompleted,
        total_guesses: totalGuesses,
        green_letters: greenLetters,
        game_type: "solo",
      });
    }

    setTimeout(() => {
      toast.error(`Time's up! You completed ${wordsCompleted} word${wordsCompleted !== 1 ? "s" : ""}!`);
      setShowResult(true);
    }, 500);
  }, [evaluations, finalizeTrackedSoloRound, totalGuesses, trackGame, updateStats, user, wordsCompleted]);

  const handleEnter = useCallback(async () => {
    if (gameOver || submittingGuessRef.current) return;

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

    const guess = currentGuess;
    let evaluation: Evaluation;
    let solved: boolean;
    let serverRoundOver = false;
    let answer = targetWord;

    if (isServerRound && gameMode && gameMode !== "multiplayer") {
      submittingGuessRef.current = true;
      try {
        const result = await submitSoloGuessMut({
          mode: gameMode,
          slot: currentLeaderboardSlot!,
          guess,
        });
        if (result.msRemaining !== null) {
          setTimeLeft(Math.ceil(result.msRemaining / 1000));
        }
        if (!result.evaluation) {
          // The server's clock ran out before this guess arrived.
          setRevealedAnswer(result.answer);
          endTimedGame();
          return;
        }
        evaluation = result.evaluation;
        solved = result.solved;
        serverRoundOver = result.roundOver;
        if (result.answer) {
          answer = result.answer;
          setRevealedAnswer(result.answer);
        }
      } catch (error) {
        toast.error(getErrorMessage(error, "Couldn't submit your guess"));
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return;
      } finally {
        submittingGuessRef.current = false;
      }
    } else {
      evaluation = evaluateGuess(guess, targetWord, gameMode);
      solved = guess === targetWord;
    }

    updateLetterStatus(guess, evaluation);

    const newGuesses = [...guesses, guess];
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
    if (solved) {
      // Handle timed mode - continue with unlimited rounds until time runs out
      if (gameMode === "timed") {
        setWordsCompleted(prev => prev + 1);
        if (!isServerRound) {
          // Server rounds already synced the clock from the response.
          setTimeLeft(prev => prev + TIMED_BONUS_SECONDS);
        }
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
          setEliminatedLetters([]);
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

      if (user) {
        const recorded = finalizeTrackedSoloRound({
          mode: gameMode as LimitedGameMode,
          won: true,
          greenLetters,
          rawGuesses: newGuesses.length,
        });
        if (!recorded) {
          void updateStats(gameMode as GameMode, true, greenLetters, undefined, "solo");
        }
      } else {
        finalizeTrackedSoloRound({
          mode: gameMode as LimitedGameMode,
          won: true,
          greenLetters,
          rawGuesses: newGuesses.length,
        });
        if (gameMode === "classic" || gameMode === "hard") {
          recordGuestQuestProgress(gameMode, { won: true, greenLetters });
        }
        trackGame("game_completed", {
          mode: gameMode,
          won: true,
          guesses: newGuesses.length,
          green_letters: greenLetters,
          game_type: "solo",
        });
      }

      setTimeout(() => {
        toast.success("Congratulations! 🎉");
        setShowResult(true);
      }, 1500);
      return;
    }

    // Check lose condition for classic/hard modes
    if (isServerRound ? serverRoundOver : newGuesses.length >= maxGuesses) {
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

      if (user && gameMode) {
        const recorded = finalizeTrackedSoloRound({
          mode: gameMode as LimitedGameMode,
          won: false,
          greenLetters,
          rawGuesses: newGuesses.length,
        });
        if (!recorded) {
          void updateStats(gameMode, false, greenLetters, undefined, "solo");
        }
      } else {
        if (gameMode) {
          finalizeTrackedSoloRound({
            mode: gameMode as LimitedGameMode,
            won: false,
            greenLetters,
            rawGuesses: newGuesses.length,
          });
        }
        if (gameMode === "classic" || gameMode === "hard") {
          recordGuestQuestProgress(gameMode, { won: false, greenLetters });
        }
        trackGame("game_completed", {
          mode: gameMode,
          won: false,
          guesses: newGuesses.length,
          green_letters: greenLetters,
          game_type: "solo",
        });
      }

      setTimeout(() => {
        toast.error(`The word was ${answer}`);
        setShowResult(true);
      }, 1500);
    }
  }, [
    currentGuess,
    currentLeaderboardSlot,
    endTimedGame,
    evaluations,
    finalizeTrackedSoloRound,
    gameMode,
    gameOver,
    guesses,
    isServerRound,
    maxGuesses,
    submitSoloGuessMut,
    targetWord,
    trackGame,
    updateStats,
    updateLetterStatus,
    user,
  ]);

  // Keep ref updated with the latest handleEnter
  useEffect(() => {
    handleEnterRef.current = handleEnter;
  }, [handleEnter]);

  const handlePlayAgain = async () => {
    let roundState: SoloRoundState | null = null;
    if (gameMode && gameMode !== "multiplayer") {
      try {
        roundState = await startTrackedSoloRound(gameMode);
      } catch (error) {
        toast.error(getErrorMessage(error, "Daily limit reached for this mode."));
        return;
      }

      trackGame("game_started", {
        mode: gameMode,
        game_type: botActive ? "bot" : "solo",
        start_source: "play_again",
      });
    }
    setTargetWord(getRandomWord());
    setGuesses([]);
    setCurrentGuess("");
    setEvaluations([]);
    setLetterStatus({});
    setGameOver(false);
    setWon(false);
    setShowResult(false);
    setActiveHint(null);
    setEliminatedLetters([]);
    setBotActive(false);
    setRoundHintUses(0);
    if (gameMode === "timed") {
      setTimeLeft(TIMED_INITIAL_SECONDS);
      setWordsCompleted(0);
      setTotalGuesses(0);
      setTimedGameActive(true);
    }
    if (roundState && gameMode && gameMode !== "multiplayer") {
      applySoloRoundState(roundState, gameMode);
    }
    toast.success(roundState?.resumed ? "Resumed your ranked round" : "New game started!");
  };

  const handleBackToMenu = () => {
    if (
      gameMode &&
      gameMode !== "multiplayer" &&
      !gameOver &&
      (guesses.length > 0 || totalGuesses > 0 || botActive || currentLeaderboardSlot !== null)
    ) {
      abandonTrackedSoloRound(gameMode);
      if (user) {
        void captureUserEvent({
          event: "game_abandoned",
          properties: {
            mode: gameMode,
            abandon_reason: "returned_to_menu",
            guess_count: guesses.length,
            total_guesses: totalGuesses,
            bot_active: botActive,
            game_type: botActive ? "bot" : "solo",
            resumable: currentLeaderboardSlot !== null,
          },
        }).catch(() => null);
      } else {
        trackGame("game_abandoned", {
          mode: gameMode,
          abandon_reason: "returned_to_menu",
          guess_count: guesses.length,
          total_guesses: totalGuesses,
          bot_active: botActive,
          game_type: botActive ? "bot" : "solo",
        });
      }
    }

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
    setEliminatedLetters([]);
    setBotActive(false);
    setCurrentLeaderboardSlot(null);
    setRoundHintUses(0);
    setRevealedAnswer(null);
  };

  const trackHintUsed = (properties: Record<string, unknown>) => {
    if (user) {
      void captureUserEvent({ event: "hint_used", properties }).catch(() => null);
    } else {
      trackGame("hint_used", properties);
    }
  };

  // Signed-in rounds ask the server for hints (it holds the answer); guest
  // rounds work them out locally.
  const performServerHint = async (mode: LimitedGameMode, trackAnalytics: boolean) => {
    let hint: FunctionReturnType<typeof api.soloRounds.spendHint>;
    try {
      hint = await spendSoloHintMut({ mode, slot: currentLeaderboardSlot! });
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't use a hint"));
      return false;
    }

    if (hint.kind === "round_over") {
      setRevealedAnswer(hint.answer);
      setTimeLeft(0);
      endTimedGame();
      return true;
    }

    if (hint.kind === "eliminate") {
      setEliminatedLetters((prev) => [...prev, ...hint.letters]);
      setActiveHint({ turn: currentTurn, position: -1 });
      if (trackAnalytics) {
        trackHintUsed({
          mode,
          hint_type: "eliminate_letters",
          turn: currentTurn,
          eliminated_letters_count: hint.letters.length,
          game_type: "solo",
        });
      }
      setRoundHintUses((prev) => prev + 1);
      toast.success(`Eliminated ${hint.letters.length} letters!`);
      return true;
    }

    setActiveHint({ turn: currentTurn, position: hint.position, letter: hint.letter });
    if (trackAnalytics) {
      trackHintUsed({
        mode,
        hint_type: "reveal_letter",
        turn: currentTurn,
        revealed_position: hint.position,
        game_type: "solo",
      });
    }
    if (mode === "timed") {
      if (hint.msRemaining !== null) {
        setTimeLeft(Math.ceil(hint.msRemaining / 1000));
      }
      toast.success(`Hint revealed: "${hint.letter}" (-${TIMED_HINT_PENALTY_SECONDS}s)`);
      return true;
    }
    setRoundHintUses((prev) => prev + 1);
    toast.success(`Hint revealed: "${hint.letter}"`);
    return true;
  };

  const performHintReveal = async (trackAnalytics: boolean) => {
    if (guesses.length === 0) {
      toast.error("Make your first guess to unlock hints!");
      return false;
    }

    if (isHintActiveThisTurn) {
      toast.error("You can only use one hint per guess! Make another guess first.");
      return false;
    }

    if (isServerRound && gameMode && gameMode !== "multiplayer") {
      return await performServerHint(gameMode, trackAnalytics);
    }

    if (gameMode === "hard") {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const targetLetters = new Set(targetWord.toUpperCase().split(""));
      const availableToEliminate = alphabet.filter((l) => !targetLetters.has(l) && !eliminatedLetters.includes(l));

      if (availableToEliminate.length === 0) {
        toast.info("No more letters to eliminate!");
        return false;
      }

      const shuffled = availableToEliminate.sort(() => 0.5 - Math.random());
      const toEliminate = shuffled.slice(0, 3);

      setEliminatedLetters((prev) => [...prev, ...toEliminate]);
      setActiveHint({ turn: currentTurn, position: -1 });
      if (trackAnalytics) {
        trackHintUsed({
          mode: gameMode,
          hint_type: "eliminate_letters",
          turn: currentTurn,
          eliminated_letters_count: toEliminate.length,
          game_type: "solo",
        });
      }
      setRoundHintUses((prev) => prev + 1);
      toast.success("Eliminated 3 letters!");
      return true;
    }

    const correctPositions = new Set<number>();
    evaluations.forEach((evaluation) => {
      evaluation.forEach((status, index) => {
        if (status === "correct") {
          correctPositions.add(index);
        }
      });
    });

    const availablePositions: number[] = [];
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (!correctPositions.has(i)) {
        availablePositions.push(i);
      }
    }

    if (availablePositions.length === 0) {
      toast.info("All letters are already revealed!");
      return false;
    }

    const randomIndex = Math.floor(Math.random() * availablePositions.length);
    const positionToReveal = availablePositions[randomIndex];

    setActiveHint({
      turn: currentTurn,
      position: positionToReveal,
      letter: targetWord[positionToReveal].toUpperCase(),
    });
    if (trackAnalytics) {
      trackHintUsed({
        mode: gameMode,
        hint_type: "reveal_letter",
        turn: currentTurn,
        revealed_position: positionToReveal,
        game_type: "solo",
      });
    }
    setRoundHintUses((prev) => (gameMode === "timed" ? prev : prev + 1));
    if (gameMode === "timed") {
      const nextTimeLeft = Math.max(0, timeLeft - TIMED_HINT_PENALTY_SECONDS);
      setTimeLeft(nextTimeLeft);
      if (nextTimeLeft === 0) {
        endTimedGame();
        return true;
      }
      toast.success(`Hint revealed: "${targetWord[positionToReveal].toUpperCase()}" (-${TIMED_HINT_PENALTY_SECONDS}s)`);
      return true;
    }
    toast.success(`Hint revealed: "${targetWord[positionToReveal].toUpperCase()}"`);
    return true;
  };

  const handleHint = (e?: React.MouseEvent) => {
    if (gameOver) return;

    if (e?.currentTarget instanceof HTMLElement) {
      e.currentTarget.blur();
    }

    void performHintReveal(true);
  };

  const handleSelectMode = async (mode: GameMode, isBot: boolean = false) => {
    let roundState: SoloRoundState | null = null;
    if (mode !== "multiplayer" && !isBot) {
      try {
        roundState = await startTrackedSoloRound(mode);
      } catch (error) {
        toast.error(getErrorMessage(error, "Daily limit reached for this mode."));
        return;
      }
    }

    trackGame("mode_selected", { mode, game_type: isBot ? "bot" : "solo" });
    trackGame("game_started", {
      mode,
      game_type: isBot ? "bot" : "solo",
      start_source: "mode_selected",
    });

    setGameMode(mode);
    setTargetWord(getRandomWord());
    if (mode === "timed") {
      setTimedGameActive(true);
      setTimeLeft(TIMED_INITIAL_SECONDS);
    }
    if (roundState && mode !== "multiplayer") {
      applySoloRoundState(roundState, mode);
      if (roundState.resumed) {
        toast.info("Resumed your ranked round");
      }
    }

    if (isBot) {
      setBotDifficulty("easy");
      setBotActive(true);
    }
  };

  const openBotDifficultyPicker = () => {
    setShowBotDifficultyModal(true);
    toast.info("Choose a bot difficulty");
  };

  const handleToggleBot = () => {
    if (gameMode === "hard" || gameMode === "timed") {
      toast.error(`Bot cannot be used in ${gameMode} mode!`);
      return;
    }

    if (gameOver) {
      toast.error("Game is over! Start a new game to use the bot.");
      return;
    }

    if (!botActive) {
      // Show difficulty picker instead of immediately activating
      openBotDifficultyPicker();
    } else {
      setBotActive(false);
      toast.info("Bot deactivated.");
    }
  };

  const handleSelectBotDifficulty = (difficulty: BotDifficulty) => {
    setBotDifficulty(difficulty);
    setBotActive(true);
    setShowBotDifficultyModal(false);
    if (isServerRound) {
      toast.info("Your ranked round is saved. Pick this mode from the menu to resume it.");
    }
    const labels = { easy: "Easy", medium: "Medium", hard: "Hard" };
    trackGame("game_started", {
      mode: gameMode,
      game_type: "bot",
      bot_difficulty: difficulty,
      start_source: "bot_activated",
    });
    trackGame("bot_game_started", { mode: gameMode, bot_difficulty: difficulty });
    toast.success(`Bot activated on ${labels[difficulty]} difficulty!`);
  };

  // Timed mode timer
  useEffect(() => {
    if (gameMode === "timed" && timedGameActive && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameMode, timedGameActive, timeLeft]);

  // End the round from an effect rather than inside the state updater above:
  // updaters must be pure, and React may call them more than once.
  useEffect(() => {
    if (gameMode === "timed" && timedGameActive && timeLeft <= 0) {
      endTimedGame();
    }
  }, [endTimedGame, gameMode, timedGameActive, timeLeft]);

  // Handle keyboard events. The bot game has its own listener, so this one
  // stays quiet while it's on screen.
  useEffect(() => {
    if (botActive) return;
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
  }, [botActive, handleKeyPress, handleDelete, handleEnter]);

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
        {showGuidedTour && (
          <GuidedTour onComplete={() => setShowGuidedTour(false)} />
        )}
        {showHelpSlides && (
          <OnboardingGuide onComplete={() => setShowHelpSlides(false)} />
        )}
        <GameMenu
          onSelectMode={handleSelectMode}
          onShowLeaderboard={() => setShowLeaderboard(true)}
          onResumeGame={handleResumeGame}
          onShowHelp={() => setShowHelpSlides(true)}
          themeClassName={cosmeticThemeClassName}
          dailyModeLimits={
            signedInDailyModeLimits ?? guestDailyModeLimits ?? {
              dayKey: "",
              limit: DAILY_MODE_ROUND_LIMIT,
              modes: {
                classic: { played: 0, remaining: DAILY_MODE_ROUND_LIMIT, reached: false },
                hard: { played: 0, remaining: DAILY_MODE_ROUND_LIMIT, reached: false },
                timed: { played: 0, remaining: DAILY_MODE_ROUND_LIMIT, reached: false },
              },
            }
          }
        />
        <Leaderboard open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
      </>
    );
  }

  if (gameMode === "multiplayer") {
    return (
      <Suspense fallback={
        <div className={cn("min-h-screen bg-background flex items-center justify-center", cosmeticThemeClassName)}>
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Loading multiplayer...</p>
          </div>
        </div>
      }>
        <MultiplayerGame onBackToMenu={handleBackToMenu} themeClassName={cosmeticThemeClassName} />
      </Suspense>
    );
  }

  if (botActive) {
    return (
      <Suspense fallback={
        <div className={cn("min-h-screen bg-background flex items-center justify-center", cosmeticThemeClassName)}>
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
          themeClassName={cosmeticThemeClassName}
        />
      </Suspense>
    );
  }

  return (
    <div className={cn("h-screen bg-background flex flex-col overflow-hidden", cosmeticThemeClassName)}>
      <GameHeader
        onShowHelp={() => setShowHelp(true)}
        onShowStats={() => setShowLeaderboard(true)}
        onHint={handleHint}
        availableHints={!isHintActiveThisTurn && guesses.length > 0 ? 1 : 0}
        hintsDisabled={gameOver}
        onToggleBot={handleToggleBot}
        botActive={botActive}
        botDisabled={gameOver || gameMode === "hard" || gameMode === "timed"}
        highlightHints={!seenGameplayWalkthroughs.hints && !gameOver}
        highlightBot={!seenGameplayWalkthroughs.wordBot && gameMode === "classic" && !gameOver}
      />

      <div className="flex flex-col items-start justify-between gap-1.5 border-b px-2.5 py-1.5 flex-shrink-0 sm:flex-row sm:items-center sm:gap-2 sm:px-4 sm:py-2">
        <Button variant="ghost" size="sm" onClick={handleBackToMenu} className="h-7 px-2 sm:h-8">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="text-xs sm:text-sm">Menu</span>
        </Button>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:gap-4 sm:text-sm">
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

      <main className="flex min-h-0 flex-1 flex-col items-center justify-start gap-1 overflow-x-hidden overflow-y-auto px-1 py-1.5 sm:justify-center sm:gap-4 sm:overflow-hidden sm:px-4 sm:py-2">
        <div className="flex w-full min-h-0 items-start justify-center overflow-visible pt-0.5 sm:items-center sm:overflow-hidden sm:pt-0">
          <GameGrid
            guesses={guesses}
            currentGuess={currentGuess}
            evaluations={evaluations}
            maxGuesses={maxGuesses}
            wordLength={WORD_LENGTH}
            shake={shake}
            hintLetters={activeHintLetters}
          />
        </div>

        <div className="flex w-full flex-shrink-0 justify-center pb-0.5 pt-0.5 sm:pt-0">
          <Keyboard
            onKeyPress={handleKeyPress}
            onEnter={handleEnter}
            onDelete={handleDelete}
            letterStatus={letterStatus}
            eliminatedLetters={eliminatedLetters}
          />
        </div>
      </main>

      <ResultModal
        open={showResult}
        onClose={() => setShowResult(false)}
        won={won}
        word={user ? revealedAnswer ?? "" : targetWord}
        guesses={gameMode === "timed" ? totalGuesses : guesses.length}
        isTimed={gameMode === "timed"}
        roundsWon={wordsCompleted}
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

      {activeGameplayWalkthrough && (
        <FeatureWalkthroughDialog
          open={activeGameplayWalkthrough !== null}
          slides={GAMEPLAY_WALKTHROUGH_CONFIG[activeGameplayWalkthrough].slides}
          actionLabel={GAMEPLAY_WALKTHROUGH_CONFIG[activeGameplayWalkthrough].actionLabel}
          onAction={handleGameplayWalkthroughPrimary}
          onOpenChange={(open) => !open && closeGameplayWalkthrough()}
        />
      )}

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
