import { Button } from "@/components/ui/button";
import { CosmeticsStore, DailyQuestsSidebar } from "./CosmeticsStore";
import { Card } from "@/components/ui/card";
import { Zap, Target, Trophy, Flame, Timer, Award, LogIn, LogOut, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { UserStats } from "./UserStats";
import { FriendSearch } from "./FriendSearch";
import { FriendRequests } from "./FriendRequests";
import { FriendsList } from "./FriendsList";
import { IncomingChallenges } from "./IncomingChallenges";
import { OpenGames } from "./OpenGames";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "sonner";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  FeatureDiscoveryHalo,
  FeatureWalkthroughDialog,
  WalkthroughSlide,
} from "@/components/FeatureWalkthrough";

export type GameMode = "classic" | "hard" | "timed" | "multiplayer";

type WalkthroughKey =
  | "classic"
  | "hard"
  | "timed"
  | "multiplayer"
  | "signup"
  | "quests"
  | "social"
  | "cosmetics";

type WalkthroughConfig = {
  slides: WalkthroughSlide[];
  actionLabel?: string;
};

const WALKTHROUGH_STORAGE_KEY = "wordclash_menu_walkthroughs_v2";

const WALKTHROUGH_CONFIG: Record<WalkthroughKey, WalkthroughConfig> = {
  classic: {
    slides: [
      {
        title: "Classic Mode",
        subtitle: "The best place to start",
        description:
          "Classic is the main WordClash ruleset and the easiest way to learn the game.",
        bullets: [
          "You have 6 guesses to find the secret 5-letter word.",
          "Every guess teaches you more about the answer.",
          "This mode is ideal for first-time players.",
        ],
        accentVar: "menu-classic",
      },
      {
        title: "Read the Colors",
        subtitle: "How feedback works",
        description:
          "After each guess, tile colors tell you how close you are to the answer.",
        bullets: [
          "Green means the letter is correct and in the right spot.",
          "Yellow means the letter exists but belongs somewhere else.",
          "Grey means the letter is not in the word.",
        ],
        accentVar: "menu-classic",
      },
    ],
    actionLabel: "Start Classic",
  },
  hard: {
    slides: [
      {
        title: "Hard Mode",
        subtitle: "Less feedback, more pressure",
        description:
          "Hard Mode strips out yellow clues and makes every guess a sharper logic test.",
        bullets: [
          "You get 10 guesses instead of 6.",
          "Only green and grey feedback appears.",
          "This mode rewards memory and discipline.",
        ],
        accentVar: "menu-hard",
      },
      {
        title: "Hard Mode Hints",
        subtitle: "Hints work differently here",
        description:
          "Because the mode is stricter, hint behavior changes too.",
        bullets: [
          "Hints do not reveal a letter in the grid.",
          "Instead, they eliminate wrong letters from the keyboard.",
          "Use them to narrow the alphabet without giving away placement.",
        ],
        accentVar: "menu-hard",
      },
    ],
    actionLabel: "Start Hard Mode",
  },
  timed: {
    slides: [
      {
        title: "Timed Mode",
        subtitle: "Chain words under pressure",
        description:
          "Timed Mode is about momentum. One solved word buys you time for the next one.",
        bullets: [
          "You begin with 90 seconds on the clock.",
          "There is no fixed guess cap per word.",
          "Your goal is to finish as many words as possible.",
        ],
        accentVar: "menu-timed",
      },
      {
        title: "Build Your Run",
        subtitle: "How scoring works",
        description:
          "Success in Timed Mode comes from speed and consistency, not a single perfect solve.",
        bullets: [
          "Each solved word adds +30 seconds.",
          "The board resets instantly for the next target word.",
          "Your final score is the total number of words completed.",
        ],
        accentVar: "menu-timed",
      },
    ],
    actionLabel: "Start Timed",
  },
  multiplayer: {
    slides: [
      {
        title: "Multiplayer Mode",
        subtitle: "Lobbies, races, and challenges",
        description:
          "Multiplayer lets you host a lobby, share a code, and race other players on the same word.",
        bullets: [
          "Create a lobby and invite people with a code.",
          "Up to 4 players can join one match.",
          "The fastest solve wins the round.",
        ],
        accentVar: "menu-multiplayer",
      },
      {
        title: "Challenges",
        subtitle: "Direct matches with friends",
        description:
          "You can also challenge friends directly without opening a public-style lobby flow.",
        bullets: [
          "Add friends from the home screen social section.",
          "Send a challenge invite to start a head-to-head match.",
          "Resume open games anytime from Your Active Games.",
        ],
        accentVar: "menu-multiplayer",
      },
    ],
    actionLabel: "Open Multiplayer",
  },
  signup: {
    slides: [
      {
        title: "Sign In / Sign Up",
        subtitle: "Unlock the full game",
        description:
          "An account turns WordClash from a solo toy into a persistent profile with progression and social features.",
        bullets: [
          "Save your stats and streaks.",
          "Add friends and send direct challenges.",
          "Earn shards and unlock cosmetics over time.",
        ],
        accentVar: "primary",
      },
      {
        title: "What You Keep",
        subtitle: "Your progress follows you",
        description:
          "Signing in gives your profile a home so features can build over multiple sessions.",
        bullets: [
          "Your active games stay accessible.",
          "Quest and cosmetic progress can be tracked.",
          "Leaderboards and multiplayer identity work properly.",
        ],
        accentVar: "primary",
      },
    ],
    actionLabel: "Go to Sign In",
  },
  quests: {
    slides: [
      {
        title: "Daily Quests",
        subtitle: "Your daily progression loop",
        description:
          "Daily quests give you a reason to try different modes and reward you with shards.",
        bullets: [
          "Quest progress updates as you finish games.",
          "Completed quests can be claimed for shards.",
          "The timer shows when tomorrow's quests arrive.",
        ],
        accentVar: "menu-timed",
      },
      {
        title: "Why Shards Matter",
        subtitle: "Quests feed cosmetics",
        description:
          "Shards are the main cosmetic currency, so quests connect directly to personalization.",
        bullets: [
          "Claiming a finished quest adds shards to your wallet.",
          "Those shards are spent in the cosmetics store.",
          "Checking quests daily is the fastest way to unlock styles.",
        ],
        accentVar: "menu-timed",
      },
    ],
    actionLabel: "Got it",
  },
  social: {
    slides: [
      {
        title: "Friends and Challenges",
        subtitle: "Your social control center",
        description:
          "This whole section is where your ongoing multiplayer life lives.",
        bullets: [
          "Resume active games from one place.",
          "Accept incoming challenges and friend requests.",
          "Search for friends and start direct matches.",
        ],
        accentVar: "menu-multiplayer",
      },
      {
        title: "Why It Matters",
        subtitle: "Keep momentum between sessions",
        description:
          "You do not need to remember codes or track games manually once your social network is set up.",
        bullets: [
          "Open games stay visible until they are finished.",
          "Challenges feel more like a conversation than a one-off match.",
          "The social area becomes your fastest route back into play.",
        ],
        accentVar: "menu-multiplayer",
      },
    ],
    actionLabel: "Got it",
  },
  cosmetics: {
    slides: [
      {
        title: "Cosmetics Store",
        subtitle: "Unlock and equip your style",
        description:
          "Cosmetics let you personalize boards, letters, backgrounds, and reveal effects.",
        bullets: [
          "Shards come from daily quest rewards.",
          "Owned items can be equipped instantly.",
          "Themes affect how your board looks in game.",
        ],
        accentVar: "primary",
      },
      {
        title: "What Other Players See",
        subtitle: "Style is now visible in multiplayer too",
        description:
          "Your equipped board theme is not just for you anymore. Other players can see it in challenge and multiplayer matches.",
        bullets: [
          "Themes make your board feel distinct.",
          "Multiplayer now shows each player's equipped style.",
          "Collecting cosmetics becomes part of your public identity.",
        ],
        accentVar: "primary",
      },
    ],
    actionLabel: "Got it",
  },
};

const DEFAULT_WALKTHROUGH_STATE: Record<WalkthroughKey, boolean> = {
  classic: false,
  hard: false,
  timed: false,
  multiplayer: false,
  signup: false,
  quests: false,
  social: false,
  cosmetics: false,
};

const loadWalkthroughState = (): Record<WalkthroughKey, boolean> => {
  if (typeof window === "undefined") {
    return DEFAULT_WALKTHROUGH_STATE;
  }

  try {
    const raw = window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WALKTHROUGH_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<Record<WalkthroughKey, boolean>>;
    return {
      ...DEFAULT_WALKTHROUGH_STATE,
      ...parsed,
    };
  } catch {
    return DEFAULT_WALKTHROUGH_STATE;
  }
};

const persistWalkthroughState = (state: Record<WalkthroughKey, boolean>) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(state));
};

interface GameMenuProps {
  onSelectMode: (mode: GameMode) => void;
  onShowLeaderboard: () => void;
  onResumeGame?: (gameId: string) => void;
  onShowHelp?: () => void;
  themeClassName?: string;
}

export const GameMenu = ({ onSelectMode, onShowLeaderboard, onResumeGame, onShowHelp, themeClassName }: GameMenuProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [friendsKey, setFriendsKey] = useState(0);
  const [seenWalkthroughs, setSeenWalkthroughs] = useState<Record<WalkthroughKey, boolean>>(
    loadWalkthroughState,
  );
  const [activeWalkthrough, setActiveWalkthrough] = useState<WalkthroughKey | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const hasBackgroundTheme = themeClassName?.includes("theme-bg-") ?? false;
  const activeConfig = useMemo(
    () => (activeWalkthrough ? WALKTHROUGH_CONFIG[activeWalkthrough] : null),
    [activeWalkthrough],
  );

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
  };

  const refreshFriends = () => {
    setFriendsKey(prev => prev + 1);
  };

  const markWalkthroughSeen = (key: WalkthroughKey) => {
    setSeenWalkthroughs((prev) => {
      if (prev[key]) {
        return prev;
      }
      const next = { ...prev, [key]: true };
      persistWalkthroughState(next);
      return next;
    });
  };

  const openWalkthrough = (key: WalkthroughKey, action?: () => void) => {
    markWalkthroughSeen(key);
    pendingActionRef.current = action ?? null;
    setActiveWalkthrough(key);
  };

  const closeWalkthrough = () => {
    pendingActionRef.current = null;
    setActiveWalkthrough(null);
  };

  const handleWalkthroughPrimary = () => {
    const nextAction = pendingActionRef.current;
    closeWalkthrough();
    nextAction?.();
  };

  const interceptFeatureClick =
    (key: WalkthroughKey) => (event: React.MouseEvent<HTMLDivElement>) => {
      if (seenWalkthroughs[key]) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openWalkthrough(key);
    };

  const handleModeSelection = (
    mode: GameMode,
    walkthroughKey: Extract<WalkthroughKey, "classic" | "hard" | "timed" | "multiplayer">,
    event?: React.MouseEvent,
  ) => {
    event?.preventDefault();
    event?.stopPropagation();

    const startMode = () => {
      if (mode === "multiplayer" && !user) {
        toast.error("Please sign in or create an account to play Multiplayer modes!");
        return;
      }
      onSelectMode(mode);
    };

    if (!seenWalkthroughs[walkthroughKey]) {
      openWalkthrough(walkthroughKey, startMode);
      return;
    }

    startMode();
  };

  const handleSignupClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const continueToAuth = () => navigate("/auth");

    if (!seenWalkthroughs.signup) {
      openWalkthrough("signup", continueToAuth);
      return;
    }

    continueToAuth();
  };

  return (
    <>
      <div className={cn("relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:py-10", themeClassName)}>
      {!hasBackgroundTheme && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,hsl(var(--menu-classic)/0.12),transparent_18%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--background-alt)))]" />
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--border)/0.45)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.45)_1px,transparent_1px)] [background-size:72px_72px]" />
        </>
      )}

      <div className="absolute right-4 top-4 flex items-center gap-2">
        {onShowHelp && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onShowHelp}
            className="h-10 w-10 rounded-full border border-border/60 bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground"
            id="tour-help-btn"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        )}
        <ThemeToggle />
        <span className="rounded-full border border-border/80 bg-background/70 px-3 py-1 text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground/80 backdrop-blur">
          V1.0
        </span>
      </div>

      <div className="relative mx-auto max-w-[1360px] space-y-10">
        {/* Header */}
        <div id="tour-header" className="space-y-5 text-center animate-fade-in">
          <div className="mb-2 flex items-center justify-center gap-3">
            <div className="rounded-full border border-border/80 bg-card/50 p-4 backdrop-blur">
              <Trophy className="h-10 w-10 text-primary animate-pulse" />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <h1 className="bg-gradient-to-r from-foreground via-foreground to-primary/70 bg-clip-text text-center text-6xl font-black tracking-[-0.1em] text-transparent sm:text-7xl md:text-8xl">
              WORDCLASH
            </h1>
            <Button
              id="tour-leaderboard"
              variant="outline"
              size="icon"
              onClick={onShowLeaderboard}
              className="h-11 w-11 border-amber-400/25 bg-amber-400/10 text-amber-300 hover:border-amber-300 hover:bg-amber-300/15 hover:text-amber-200"
            >
              <Award className="w-5 h-5" />
            </Button>
          </div>
          <p className="mx-auto max-w-2xl text-base font-medium leading-7 text-muted-foreground sm:text-lg">
            Tactical word battles in a neon-lit arena. Sharpen your guesses, challenge your friends, and chase perfect runs.
          </p>

          {/* Auth Status */}
          <div id="tour-auth" className="flex items-center justify-center gap-3 pt-2">
            {user ? (
              <Button variant="outline" onClick={handleSignOut} size="sm" className="bg-background/50">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            ) : (
              <div className="relative rounded-full">
                {!seenWalkthroughs.signup && (
                  <FeatureDiscoveryHalo accentVar={WALKTHROUGH_CONFIG.signup.slides[0].accentVar} />
                )}
                <Button variant="default" onClick={handleSignupClick} size="sm" className="px-5 relative">
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In / Sign Up
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="grid items-start gap-8 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="order-2 xl:order-1 xl:sticky xl:top-8">
            <div
              className="relative rounded-[2rem]"
              onClickCapture={interceptFeatureClick("quests")}
            >
              {!seenWalkthroughs.quests && (
                <FeatureDiscoveryHalo accentVar={WALKTHROUGH_CONFIG.quests.slides[0].accentVar} />
              )}
              <DailyQuestsSidebar />
            </div>
          </aside>

          <div className="order-1 space-y-10 xl:order-2">
            {/* User Stats */}
            {user && (
              <div className="animate-fade-in">
                <UserStats />
              </div>
            )}

            {/* Friends Section */}
            {user && (
              <div
                className="relative rounded-[2rem] animate-fade-in"
                onClickCapture={interceptFeatureClick("social")}
              >
                {!seenWalkthroughs.social && (
                  <FeatureDiscoveryHalo accentVar={WALKTHROUGH_CONFIG.social.slides[0].accentVar} />
                )}
                <div className="space-y-6">
                  <OpenGames onResumeGame={(gameId) => onResumeGame?.(gameId)} />
                  <IncomingChallenges />
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-6">
                      <Card className="border-border/70 bg-card/60 p-6">
                        <h3 className="mb-4 text-xl font-bold tracking-tight">Add Friends</h3>
                        <FriendSearch onRequestSent={refreshFriends} />
                      </Card>
                      <FriendRequests key={friendsKey} onRequestHandled={refreshFriends} />
                    </div>
                    <FriendsList key={friendsKey} />
                  </div>
                </div>
              </div>
            )}

            {/* Game Mode Cards */}
            <div className="grid gap-6 md:grid-cols-3 animate-scale-in">
              {/* Classic Mode */}
              <Card
                id="tour-classic"
                className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-classic))]"
                onClick={(event) => handleModeSelection("classic", "classic", event)}
              >
                {!seenWalkthroughs.classic && (
                  <FeatureDiscoveryHalo accentVar={WALKTHROUGH_CONFIG.classic.slides[0].accentVar} />
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-classic))]/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative p-6 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-[hsl(var(--menu-classic))]/30 bg-[hsl(var(--menu-classic))]/12 transition-colors group-hover:bg-[hsl(var(--menu-classic))]/18">
                      <Target className="w-8 h-8 text-[hsl(var(--menu-classic))]" />
                    </div>
                    <Badge variant="secondary" className="border border-border/70 bg-secondary/80 text-xs text-foreground">Popular</Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold tracking-tight text-foreground">Classic</h3>
                    <p className="text-sm text-muted-foreground">
                      The original WordClash experience with 6 attempts to guess the word
                    </p>
                  </div>

                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-classic))]" />
                      6 guesses maximum
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-classic))]" />
                      Green & yellow hints
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-classic))]" />
                      Perfect for beginners
                    </li>
                  </ul>

                  <Button
                    className="w-full bg-[hsl(var(--menu-classic))] font-semibold uppercase tracking-[0.18em] text-white hover:bg-[hsl(var(--menu-classic))]/90"
                    size="lg"
                    onClick={(event) => handleModeSelection("classic", "classic", event)}
                  >
                    Start Classic
                  </Button>
                </div>
              </Card>

              {/* Hard Mode */}
              <Card
                id="tour-hard"
                className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-hard))]"
                onClick={(event) => handleModeSelection("hard", "hard", event)}
              >
                {!seenWalkthroughs.hard && (
                  <FeatureDiscoveryHalo accentVar={WALKTHROUGH_CONFIG.hard.slides[0].accentVar} />
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-hard))]/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative p-6 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-[hsl(var(--menu-hard))]/30 bg-[hsl(var(--menu-hard))]/12 transition-colors group-hover:bg-[hsl(var(--menu-hard))]/18">
                      <Flame className="w-8 h-8 text-[hsl(var(--menu-hard))]" />
                    </div>
                    <Badge className="border-0 bg-[hsl(var(--menu-hard))] text-xs text-white">Challenge</Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold tracking-tight text-foreground">Hard Mode</h3>
                    <p className="text-sm text-muted-foreground">
                      No yellow hints! Pure skill mode for word masters
                    </p>
                  </div>

                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-hard))]" />
                      10 guesses maximum
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-hard))]" />
                      Only correct or wrong
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-hard))]" />
                      No hints available
                    </li>
                  </ul>

                  <Button
                    className="w-full bg-[hsl(var(--menu-hard))] font-semibold uppercase tracking-[0.18em] text-white hover:bg-[hsl(var(--menu-hard))]/90"
                    size="lg"
                    onClick={(event) => handleModeSelection("hard", "hard", event)}
                  >
                    Start Hard Mode
                  </Button>
                </div>
              </Card>

              {/* Timed Mode */}
              <Card
                id="tour-timed"
                className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-timed))]"
                onClick={(event) => handleModeSelection("timed", "timed", event)}
              >
                {!seenWalkthroughs.timed && (
                  <FeatureDiscoveryHalo accentVar={WALKTHROUGH_CONFIG.timed.slides[0].accentVar} />
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-timed))]/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative p-6 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-[hsl(var(--menu-timed))]/30 bg-[hsl(var(--menu-timed))]/12 transition-colors group-hover:bg-[hsl(var(--menu-timed))]/18">
                      <Timer className="w-8 h-8 text-[hsl(var(--menu-timed))]" />
                    </div>
                    <Badge className="border-0 bg-[hsl(var(--menu-timed))] text-xs text-white">Fast</Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold tracking-tight text-foreground">Timed Mode</h3>
                    <p className="text-sm text-muted-foreground">
                      Race against the clock! Solve as many as you can
                    </p>
                  </div>

                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-timed))]" />
                      90 seconds to start
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-timed))]" />
                      +30s bonus per word
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-timed))]" />
                      Unlimited attempts
                    </li>
                  </ul>

                  <Button
                    className="w-full bg-[hsl(var(--menu-timed))] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--menu-timed))]/90"
                    size="lg"
                    onClick={(event) => handleModeSelection("timed", "timed", event)}
                  >
                    Start Timed
                  </Button>
                </div>
              </Card>
            </div>

            {/* Multiplayer Mode - Full Width */}
            <Card
              id="tour-multiplayer"
              className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-multiplayer))] animate-scale-in"
              onClick={(event) => handleModeSelection("multiplayer", "multiplayer", event)}
            >
              {!seenWalkthroughs.multiplayer && (
                <FeatureDiscoveryHalo accentVar={WALKTHROUGH_CONFIG.multiplayer.slides[0].accentVar} />
              )}
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-multiplayer))]/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative p-6 md:p-8">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-[hsl(var(--menu-multiplayer))]/30 bg-[hsl(var(--menu-multiplayer))]/12 transition-colors group-hover:bg-[hsl(var(--menu-multiplayer))]/18">
                        <Zap className="w-8 h-8 text-[hsl(var(--menu-multiplayer))]" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-3xl font-bold tracking-tight text-foreground">Multiplayer Mode</h3>
                        <p className="text-sm text-muted-foreground">
                          Create or join a lobby and play with up to four people
                        </p>
                      </div>
                    </div>
                    <Badge className="border-0 bg-[hsl(var(--menu-multiplayer))] text-xs text-[hsl(var(--primary-foreground))]">New</Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/55 p-4">
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                      <p className="text-sm text-muted-foreground">Host a lobby with a shareable code</p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/55 p-4">
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                      <p className="text-sm text-muted-foreground">Start once everyone is ready</p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/55 p-4">
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                      <p className="text-sm text-muted-foreground">Up to 4 players, first solver wins</p>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-[hsl(var(--menu-multiplayer))] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--menu-multiplayer))]/90 md:w-auto"
                    size="lg"
                    onClick={(e) => {
                      handleModeSelection("multiplayer", "multiplayer", e);
                    }}
                  >
                    Open Multiplayer Lobby
                  </Button>
                </div>
              </div>
            </Card>

            <div
              className="relative rounded-[2rem]"
              onClickCapture={interceptFeatureClick("cosmetics")}
            >
              {!seenWalkthroughs.cosmetics && (
                <FeatureDiscoveryHalo accentVar={WALKTHROUGH_CONFIG.cosmetics.slides[0].accentVar} />
              )}
              <CosmeticsStore />
            </div>
          </div>
        </div>
      </div>
      </div>

      {activeConfig && (
        <FeatureWalkthroughDialog
          open={activeWalkthrough !== null}
          slides={activeConfig.slides}
          actionLabel={activeConfig.actionLabel}
          onAction={handleWalkthroughPrimary}
          onOpenChange={(open) => !open && closeWalkthrough()}
        />
      )}
    </>
  );
};
