import { Button } from "@/components/ui/button";
import { CosmeticsStore, DailyQuestsSidebar } from "./CosmeticsStore";
import { Card } from "@/components/ui/card";
import { Zap, Target, Trophy, Flame, Timer, Award, LogIn, LogOut, HelpCircle, ChevronDown } from "lucide-react";
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
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DAILY_MODE_ROUND_LIMIT, type DailyModeLimits, type LimitedGameMode } from "@/lib/guestLimits";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { RandomMatchRequestPrompt } from "@/components/RandomMatchRequestPrompt";
import { Leaderboard } from "@/components/Leaderboard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type GameMode = "classic" | "hard" | "timed" | "multiplayer";

type MenuSectionKey = "stats" | "quests" | "social" | "leaderboard" | "cosmetics";

type ExpandableMenuSectionProps = {
  title: string;
  subtitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

const ExpandableMenuSection = ({
  title,
  subtitle,
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
}: ExpandableMenuSectionProps) => (
  <Collapsible open={open} onOpenChange={onOpenChange} className={cn("w-full min-w-0", className)}>
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className="flex w-full min-w-0 flex-col items-start gap-2.5 overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/55 px-4 py-3 text-left transition-colors hover:bg-card/70 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
      >
        <div className="min-w-0 w-full space-y-1">
          <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">{title}</h2>
          <p className="max-w-full break-words text-xs leading-5 text-muted-foreground sm:text-sm">{subtitle}</p>
        </div>
        <div className="flex shrink-0 self-end items-center gap-1.5 rounded-full border border-border/70 bg-background/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:self-auto sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.16em]">
          {open ? "Hide" : "Show"}
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>
    </CollapsibleTrigger>
    <CollapsibleContent className="w-full min-w-0 overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
      <div className={cn("w-full min-w-0 pt-3 sm:pt-4", contentClassName)}>{children}</div>
    </CollapsibleContent>
  </Collapsible>
);

interface GameMenuProps {
  onSelectMode: (mode: GameMode, isBot?: boolean) => void | Promise<void>;
  onShowLeaderboard: () => void;
  onResumeGame?: (gameId: string) => void;
  onShowHelp?: () => void;
  themeClassName?: string;
  dailyModeLimits: DailyModeLimits;
}

export const GameMenu = ({
  onSelectMode,
  onShowLeaderboard,
  onResumeGame,
  onShowHelp,
  themeClassName,
  dailyModeLimits,
}: GameMenuProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [friendsKey, setFriendsKey] = useState(0);
  const [sectionOpen, setSectionOpen] = useState<Record<MenuSectionKey, boolean>>({
    stats: false,
    quests: false,
    social: false,
    leaderboard: true,
    cosmetics: false,
  });
  const hasBackgroundTheme = themeClassName?.includes("theme-bg-") ?? false;
  const heartbeatPresence = useMutation(api.matchmaking.presenceHeartbeat);
  const acceptRandomMatch = useMutation(api.matchmaking.acceptRandomMatchmaking);
  const declineRandomMatch = useMutation(api.matchmaking.declineRandomMatchmaking);
  const incomingRandomMatchRequest = useQuery(
    api.matchmaking.getIncomingRandomMatchRequest,
    user ? {} : "skip",
  );
  const [processingRandomRequest, setProcessingRandomRequest] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
  };

  const refreshFriends = () => {
    setFriendsKey(prev => prev + 1);
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    void heartbeatPresence({ availableForRandomMatch: true }).catch(() => null);
    const intervalId = window.setInterval(() => {
      void heartbeatPresence({ availableForRandomMatch: true }).catch(() => null);
    }, 12_000);

    return () => {
      window.clearInterval(intervalId);
      void heartbeatPresence({ availableForRandomMatch: false }).catch(() => null);
    };
  }, [heartbeatPresence, user]);

  const getModeLimitStatus = (mode: LimitedGameMode) => dailyModeLimits.modes[mode];
  const getModeLimitLabel = (mode: LimitedGameMode) => {
    const status = getModeLimitStatus(mode);
    return status.reached
      ? `${status.played}/${DAILY_MODE_ROUND_LIMIT} rounds used today`
      : `${status.remaining}/${DAILY_MODE_ROUND_LIMIT} rounds left today`;
  };

  const handleModeSelection = (
    mode: GameMode,
    event?: React.MouseEvent,
  ) => {
    event?.preventDefault();
    event?.stopPropagation();

    const startMode = () => {
      if (mode === "multiplayer" && !user) {
        toast.error("Please sign in or create an account to play Multiplayer modes!");
        return;
      }

      if (mode !== "multiplayer" && getModeLimitStatus(mode).reached) {
        toast.error(`Daily limit reached for ${mode} mode. Come back tomorrow.`);
        return;
      }

      void onSelectMode(mode, false);
    };

    startMode();
  };

  const handleSignupClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    navigate("/auth");
  };

  const handleAcceptRandomRequest = async () => {
    if (!incomingRandomMatchRequest) return;

    setProcessingRandomRequest(true);
    try {
      const result = await acceptRandomMatch({
        matchmakingId: incomingRandomMatchRequest.matchmakingId,
      });
      navigate(`/?mode=multiplayer&game=${result.gameId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept random match");
    } finally {
      setProcessingRandomRequest(false);
    }
  };

  const handleDeclineRandomRequest = async () => {
    if (!incomingRandomMatchRequest) return;

    setProcessingRandomRequest(true);
    try {
      await declineRandomMatch({
        matchmakingId: incomingRandomMatchRequest.matchmakingId,
      });
      toast.info("Random match request declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to decline random match");
    } finally {
      setProcessingRandomRequest(false);
    }
  };

  const setMenuSectionOpen = (section: MenuSectionKey, open: boolean) => {
    setSectionOpen((prev) => ({ ...prev, [section]: open }));
  };

  return (
    <>
      <div className={cn("relative min-h-screen overflow-x-hidden bg-background px-2 py-4 sm:px-4 sm:py-10", themeClassName)}>
      {!hasBackgroundTheme && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,hsl(var(--menu-classic)/0.12),transparent_18%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--background-alt)))]" />
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--border)/0.45)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.45)_1px,transparent_1px)] [background-size:72px_72px]" />
        </>
      )}

      <div className="absolute inset-x-2 top-3 flex items-center justify-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4">
        {onShowHelp && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onShowHelp}
            className="h-9 w-9 rounded-full border border-border/60 bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground sm:h-10 sm:w-10"
            id="tour-help-btn"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        )}
        <ThemeToggle />
        <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80 backdrop-blur sm:px-3 sm:text-sm sm:tracking-[0.28em]">
          V1.0
        </span>
      </div>

      <div className="relative mx-auto max-w-[1776px] space-y-6 pt-10 sm:space-y-10 sm:pt-0">
        {/* Header */}
        <div id="tour-header" className="space-y-3 text-center animate-fade-in sm:space-y-5">
          <div className="mb-1 flex items-center justify-center gap-3 sm:mb-2">
            <div className="rounded-full border border-border/80 bg-card/50 p-2.5 backdrop-blur sm:p-4">
              <Trophy className="h-9 w-9 text-primary animate-pulse sm:h-10 sm:w-10" />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <h1 className="bg-gradient-to-r from-foreground via-foreground to-primary/70 bg-clip-text text-center text-[2.7rem] font-black leading-none tracking-[-0.08em] text-transparent sm:text-7xl md:text-8xl">
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
          <p className="mx-auto max-w-2xl text-[13px] font-medium leading-5 text-muted-foreground sm:text-lg sm:leading-7">
            Tactical word battles in a neon-lit arena. Sharpen your guesses, challenge your friends, and chase perfect runs.
          </p>

          {/* Auth Status */}
          <div id="tour-auth" className="flex flex-wrap items-center justify-center gap-2.5 pt-1 sm:pt-2">
            {user ? (
              <Button variant="outline" onClick={handleSignOut} size="sm" className="bg-background/50">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            ) : (
              <Button variant="default" onClick={handleSignupClick} size="sm" className="px-5">
                <LogIn className="w-4 h-4 mr-2" />
                Sign In / Sign Up
              </Button>
            )}
          </div>
        </div>

        <div className="relative xl:pr-[26rem]">
          <div className="grid min-w-0 items-start gap-4 sm:gap-6 xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-8">
            <aside className="order-2 min-w-0 xl:order-1 xl:sticky xl:top-8">
              <div className="rounded-[2rem]">
                <ExpandableMenuSection
                  title="Daily Quests"
                  subtitle="Keep rewards and refresh timers tucked away until you need them."
                  open={sectionOpen.quests}
                  onOpenChange={(open) => setMenuSectionOpen("quests", open)}
                >
                  <DailyQuestsSidebar />
                </ExpandableMenuSection>
              </div>
            </aside>

            <div className="order-1 min-w-0 space-y-6 xl:order-2 sm:space-y-8 xl:space-y-10">
            {/* User Stats */}
            {user && (
              <div className="min-w-0 animate-fade-in">
                <ExpandableMenuSection
                  title="Profile Stats"
                  subtitle="Open your win rates and mode history when you want the deeper breakdown."
                  open={sectionOpen.stats}
                  onOpenChange={(open) => setMenuSectionOpen("stats", open)}
                >
                  <UserStats />
                </ExpandableMenuSection>
              </div>
            )}

            {/* Friends Section */}
            {user && (
              <div className="relative min-w-0 rounded-[2rem] animate-fade-in">
                <ExpandableMenuSection
                  title="Social Hub"
                  subtitle="Challenges, active games, friend requests, and your friend list live here."
                  open={sectionOpen.social}
                  onOpenChange={(open) => setMenuSectionOpen("social", open)}
                >
                  <div className="space-y-3 sm:space-y-6">
                    <OpenGames onResumeGame={(gameId) => onResumeGame?.(gameId)} />
                    <IncomingChallenges />
                    <div className="grid gap-3 md:grid-cols-2 sm:gap-6">
                      <div className="space-y-3 sm:space-y-6">
                        <Card className="border-border/70 bg-card/60 p-4 sm:p-6">
                          <h3 className="mb-3 text-lg font-bold tracking-tight sm:mb-4 sm:text-xl">Add Friends</h3>
                          <FriendSearch onRequestSent={refreshFriends} />
                        </Card>
                        <FriendRequests key={friendsKey} onRequestHandled={refreshFriends} />
                      </div>
                      <FriendsList key={friendsKey} />
                    </div>
                  </div>
                </ExpandableMenuSection>
              </div>
            )}

            {/* Multiplayer Mode - Full Width */}
            <Card
              id="tour-multiplayer"
              className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-multiplayer))] animate-scale-in"
              onClick={(event) => handleModeSelection("multiplayer", event)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-multiplayer))]/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative p-4 sm:p-6 md:p-8">
                <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] border border-[hsl(var(--menu-multiplayer))]/30 bg-[hsl(var(--menu-multiplayer))]/12 transition-colors group-hover:bg-[hsl(var(--menu-multiplayer))]/18 sm:h-16 sm:w-16 sm:rounded-[1.4rem]">
                        <Zap className="h-6 w-6 text-[hsl(var(--menu-multiplayer))] sm:h-8 sm:w-8" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-3xl">Multiplayer Mode</h3>
                        <p className="text-[13px] text-muted-foreground sm:text-sm">
                          Create or join a lobby and play with up to four people
                        </p>
                      </div>
                    </div>
                    <Badge className="w-fit border-0 bg-[hsl(var(--menu-multiplayer))] text-xs text-[hsl(var(--primary-foreground))]">New</Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/55 p-3 sm:p-4">
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                      <p className="text-[13px] text-muted-foreground sm:text-sm">Host a lobby with a shareable code</p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/55 p-3 sm:p-4">
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                      <p className="text-[13px] text-muted-foreground sm:text-sm">Start once everyone is ready</p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/55 p-3 sm:p-4">
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                      <p className="text-[13px] text-muted-foreground sm:text-sm">Up to 4 players, first solver wins</p>
                    </div>
                  </div>

                  <Button
                    className="h-11 w-full bg-[hsl(var(--menu-multiplayer))] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--menu-multiplayer))]/90 md:h-12 md:w-auto"
                    size="lg"
                    onClick={(e) => {
                      handleModeSelection("multiplayer", e);
                    }}
                  >
                    Open Multiplayer Lobby
                  </Button>
                </div>
              </div>
            </Card>

            {/* Game Mode Cards */}
            <div className="grid gap-3 animate-scale-in md:grid-cols-3 md:gap-6">
              {/* Classic Mode */}
              <Card
                id="tour-classic"
                className={cn(
                  "group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-classic))]",
                  getModeLimitStatus("classic").reached && "grayscale opacity-80"
                )}
                onClick={(event) => handleModeSelection("classic", event)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-classic))]/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative space-y-4 p-4 sm:space-y-6 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-[hsl(var(--menu-classic))]/30 bg-[hsl(var(--menu-classic))]/12 transition-colors group-hover:bg-[hsl(var(--menu-classic))]/18 sm:h-16 sm:w-16 sm:rounded-[1.4rem]">
                      <Target className="h-6 w-6 text-[hsl(var(--menu-classic))] sm:h-8 sm:w-8" />
                    </div>
                    <Badge variant="secondary" className="border border-border/70 bg-secondary/80 text-xs text-foreground">Popular</Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-2xl">Classic</h3>
                    <p className="text-[13px] text-muted-foreground sm:text-sm">
                      The original WordClash experience with 6 attempts to guess the word
                    </p>
                  </div>

                  <ul className="space-y-1.5 text-[13px] text-muted-foreground sm:space-y-2 sm:text-sm">
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
                    className={cn(
                      "h-11 w-full font-semibold uppercase tracking-[0.18em] text-white sm:h-12",
                      getModeLimitStatus("classic").reached
                        ? "bg-muted text-muted-foreground hover:bg-muted"
                        : "bg-[hsl(var(--menu-classic))] hover:bg-[hsl(var(--menu-classic))]/90"
                    )}
                    size="lg"
                    onClick={(event) => handleModeSelection("classic", event)}
                    disabled={getModeLimitStatus("classic").reached}
                  >
                    {getModeLimitStatus("classic").reached ? "Daily Limit Reached" : "Start Classic"}
                  </Button>
                  <p className="text-[10px] text-center font-medium tracking-tight text-muted-foreground">
                    {getModeLimitLabel("classic")}
                  </p>
                </div>
              </Card>

              {/* Hard Mode */}
              <Card
                id="tour-hard"
                className={cn(
                  "group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-hard))]",
                  getModeLimitStatus("hard").reached && "grayscale opacity-80"
                )}
                onClick={(event) => handleModeSelection("hard", event)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-hard))]/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative space-y-4 p-4 sm:space-y-6 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-[hsl(var(--menu-hard))]/30 bg-[hsl(var(--menu-hard))]/12 transition-colors group-hover:bg-[hsl(var(--menu-hard))]/18 sm:h-16 sm:w-16 sm:rounded-[1.4rem]">
                      <Flame className="h-6 w-6 text-[hsl(var(--menu-hard))] sm:h-8 sm:w-8" />
                    </div>
                    <Badge className="border-0 bg-[hsl(var(--menu-hard))] text-xs text-white">Challenge</Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-2xl">Hard Mode</h3>
                    <p className="text-[13px] text-muted-foreground sm:text-sm">
                      No yellow hints! Pure skill mode for word masters
                    </p>
                  </div>

                  <ul className="space-y-1.5 text-[13px] text-muted-foreground sm:space-y-2 sm:text-sm">
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
                    className="h-11 w-full bg-[hsl(var(--menu-hard))] font-semibold uppercase tracking-[0.18em] text-white hover:bg-[hsl(var(--menu-hard))]/90 disabled:opacity-50 disabled:cursor-not-allowed sm:h-12"
                    size="lg"
                    onClick={(event) => handleModeSelection("hard", event)}
                    disabled={getModeLimitStatus("hard").reached}
                  >
                    {getModeLimitStatus("hard").reached ? "Daily Limit Reached" : "Start Hard Mode"}
                  </Button>
                  <p className="text-[10px] text-center font-medium tracking-tight text-muted-foreground">
                    {getModeLimitLabel("hard")}
                  </p>
                </div>
              </Card>

              {/* Timed Mode */}
              <Card
                id="tour-timed"
                className={cn(
                  "group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-timed))]",
                  getModeLimitStatus("timed").reached && "grayscale opacity-80"
                )}
                onClick={(event) => handleModeSelection("timed", event)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-timed))]/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative space-y-4 p-4 sm:space-y-6 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-[hsl(var(--menu-timed))]/30 bg-[hsl(var(--menu-timed))]/12 transition-colors group-hover:bg-[hsl(var(--menu-timed))]/18 sm:h-16 sm:w-16 sm:rounded-[1.4rem]">
                      <Timer className="h-6 w-6 text-[hsl(var(--menu-timed))] sm:h-8 sm:w-8" />
                    </div>
                    <Badge className="border-0 bg-[hsl(var(--menu-timed))] text-xs text-white">Fast</Badge>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-2xl">Timed Mode</h3>
                    <p className="text-[13px] text-muted-foreground sm:text-sm">
                      Race against the clock! Solve as many as you can
                    </p>
                  </div>

                  <ul className="space-y-1.5 text-[13px] text-muted-foreground sm:space-y-2 sm:text-sm">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-timed))]" />
                      75 seconds to start
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-timed))]" />
                      +25s bonus per word
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-timed))]" />
                      -10s per hint
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--menu-timed))]" />
                      Unlimited attempts
                    </li>
                  </ul>

                  <Button
                    className="h-11 w-full bg-[hsl(var(--menu-timed))] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--menu-timed))]/90 disabled:opacity-50 disabled:cursor-not-allowed sm:h-12"
                    size="lg"
                    onClick={(event) => handleModeSelection("timed", event)}
                    disabled={getModeLimitStatus("timed").reached}
                  >
                    {getModeLimitStatus("timed").reached ? "Daily Limit Reached" : "Start Timed"}
                  </Button>
                  <p className="text-[10px] text-center font-medium tracking-tight text-muted-foreground">
                    {getModeLimitLabel("timed")}
                  </p>
                </div>
              </Card>
            </div>

              <ExpandableMenuSection
                title="Rankings"
                subtitle="Daily and weekly ladders stay visible, but you can collapse them when you want a cleaner menu."
                open={sectionOpen.leaderboard}
                onOpenChange={(open) => setMenuSectionOpen("leaderboard", open)}
                className="xl:hidden"
              >
                <Card className="border-border/70 bg-card/60 p-4 sm:p-6">
                  <Leaderboard variant="embedded" />
                </Card>
              </ExpandableMenuSection>

              <div className="relative min-w-0 rounded-[2rem]">
                <ExpandableMenuSection
                  title="Customization"
                  subtitle="Themes, tiles, and reveal effects are here when you want to tweak the look."
                  open={sectionOpen.cosmetics}
                  onOpenChange={(open) => setMenuSectionOpen("cosmetics", open)}
                >
                  <CosmeticsStore />
                </ExpandableMenuSection>
              </div>
            </div>
          </div>

          <aside className="hidden xl:absolute xl:right-0 xl:top-0 xl:block xl:w-[24rem]">
            <div className="xl:sticky xl:top-8">
              <ExpandableMenuSection
                title="Rankings"
                subtitle="Daily and weekly ladders stay ready on the side without crowding the main menu."
                open={sectionOpen.leaderboard}
                onOpenChange={(open) => setMenuSectionOpen("leaderboard", open)}
              >
                <Card className="border-border/70 bg-card/60 p-6">
                  <Leaderboard variant="embedded" />
                </Card>
              </ExpandableMenuSection>
            </div>
          </aside>
        </div>
      </div>
      </div>

      {incomingRandomMatchRequest && (
        <RandomMatchRequestPrompt
          requesterUsername={incomingRandomMatchRequest.requesterUsername}
          processing={processingRandomRequest}
          onAccept={() => void handleAcceptRandomRequest()}
          onDecline={() => void handleDeclineRandomRequest()}
        />
      )}

    </>
  );
};
