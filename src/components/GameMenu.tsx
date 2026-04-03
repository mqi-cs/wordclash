import { Button } from "@/components/ui/button";
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
import { useState } from "react";

export type GameMode = "classic" | "hard" | "timed" | "multiplayer";

interface GameMenuProps {
  onSelectMode: (mode: GameMode) => void;
  onShowLeaderboard: () => void;
  onResumeGame?: (gameId: string) => void;
  onShowHelp?: () => void;
}

export const GameMenu = ({ onSelectMode, onShowLeaderboard, onResumeGame, onShowHelp }: GameMenuProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [friendsKey, setFriendsKey] = useState(0);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
  };

  const refreshFriends = () => {
    setFriendsKey(prev => prev + 1);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,hsl(var(--menu-classic)/0.12),transparent_18%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--background-alt)))]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--border)/0.45)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.45)_1px,transparent_1px)] [background-size:72px_72px]" />

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

      <div className="relative mx-auto max-w-6xl space-y-10">
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
              <Button variant="default" onClick={() => navigate("/auth")} size="sm" className="px-5">
                <LogIn className="w-4 h-4 mr-2" />
                Sign In / Sign Up
              </Button>
            )}
          </div>
        </div>

        {/* User Stats */}
        {user && (
          <div className="animate-fade-in">
            <UserStats />
          </div>
        )}

        {/* Friends Section */}
        {user && (
          <div className="space-y-6 animate-fade-in">
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
        )}

        {/* Game Mode Cards */}
        <div className="grid gap-6 md:grid-cols-3 animate-scale-in">
          {/* Classic Mode */}
          <Card
            id="tour-classic"
            className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-classic))]"
            onClick={() => onSelectMode("classic")}
          >
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
                onClick={() => onSelectMode("classic")}
              >
                Start Classic
              </Button>
            </div>
          </Card>

          {/* Hard Mode */}
          <Card
            id="tour-hard"
            className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-hard))]"
            onClick={() => onSelectMode("hard")}
          >
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
                onClick={() => onSelectMode("hard")}
              >
                Start Hard Mode
              </Button>
            </div>
          </Card>

          {/* Timed Mode */}
          <Card
            id="tour-timed"
            className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/60 transition-all duration-300 hover:-translate-y-2 hover:border-[hsl(var(--menu-timed))]"
            onClick={() => onSelectMode("timed")}
          >
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
                onClick={() => onSelectMode("timed")}
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
          onClick={() => {
            if (!user) {
              toast.error("Please sign in or create an account to play Multiplayer modes!");
              return;
            }
            onSelectMode("multiplayer");
          }}
        >
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  e.stopPropagation(); // Prevent the card onClick from firing twice
                  if (!user) {
                    toast.error("Please sign in or create an account to play Multiplayer modes!");
                    return;
                  }
                  onSelectMode("multiplayer");
                }}
              >
                Open Multiplayer Lobby
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
