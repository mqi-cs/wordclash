import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Clock, Zap, Target, Trophy, Flame, Timer, Award, LogIn, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { UserStats } from "./UserStats";
import { FriendSearch } from "./FriendSearch";
import { FriendRequests } from "./FriendRequests";
import { FriendsList } from "./FriendsList";
import { IncomingChallenges } from "./IncomingChallenges";
import { OpenGames } from "./OpenGames";
import { toast } from "sonner";
import { useState } from "react";

export type GameMode = "classic" | "hard" | "timed" | "multiplayer";

interface GameMenuProps {
  onSelectMode: (mode: GameMode) => void;
  onShowLeaderboard: () => void;
  onResumeGame?: (gameId: string) => void;
}

export const GameMenu = ({ onSelectMode, onShowLeaderboard, onResumeGame }: GameMenuProps) => {
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex flex-col items-center justify-center p-4 relative">
      <span className="absolute top-4 right-4 text-m font-bold text-muted-foreground/50 select-none">V1.0</span>
      <div className="max-w-5xl w-full space-y-12">
        {/* Header */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Trophy className="w-12 h-12 text-primary animate-pulse" />
          </div>
          <div className="flex items-center justify-center gap-4">
            <h1 className="text-7xl font-black tracking-tighter bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              WORDLE
            </h1>
            <Button
              variant="outline"
              size="icon"
              onClick={onShowLeaderboard}
              className="hover:bg-amber-600/10 hover:text-amber-600 hover:border-amber-600 transition-all"
            >
              <Award className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-lg text-muted-foreground font-medium">
            Test your vocabulary • Challenge yourself • Beat the clock
          </p>

          {/* Auth Status */}
          <div className="flex items-center justify-center gap-3 pt-2">
            {user ? (
              <Button variant="outline" onClick={handleSignOut} size="sm">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            ) : (
              <Button variant="default" onClick={() => navigate("/auth")} size="sm">
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
                <Card className="p-6">
                  <h3 className="text-xl font-bold mb-4">Add Friends</h3>
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
            className="group relative overflow-hidden border-2 hover:border-[hsl(var(--menu-classic))] transition-all duration-300 hover:shadow-2xl hover:shadow-[hsl(var(--menu-classic))]/20 cursor-pointer hover:-translate-y-2"
            onClick={() => onSelectMode("classic")}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-classic))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[hsl(var(--menu-classic))]/10 group-hover:bg-[hsl(var(--menu-classic))]/20 transition-colors">
                  <Target className="w-8 h-8 text-[hsl(var(--menu-classic))]" />
                </div>
                <Badge variant="secondary" className="text-xs">Popular</Badge>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-foreground">Classic</h3>
                <p className="text-sm text-muted-foreground">
                  The original Wordle experience with 6 attempts to guess the word
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
                className="w-full bg-[hsl(var(--menu-classic))] hover:bg-[hsl(var(--menu-classic))]/90 text-white font-semibold shadow-lg"
                size="lg"
                onClick={() => onSelectMode("classic")}
              >
                Start Classic
              </Button>
            </div>
          </Card>

          {/* Hard Mode */}
          <Card
            className="group relative overflow-hidden border-2 hover:border-[hsl(var(--menu-hard))] transition-all duration-300 hover:shadow-2xl hover:shadow-[hsl(var(--menu-hard))]/20 cursor-pointer hover:-translate-y-2"
            onClick={() => onSelectMode("hard")}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-hard))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[hsl(var(--menu-hard))]/10 group-hover:bg-[hsl(var(--menu-hard))]/20 transition-colors">
                  <Flame className="w-8 h-8 text-[hsl(var(--menu-hard))]" />
                </div>
                <Badge className="text-xs bg-[hsl(var(--menu-hard))] text-white">Challenge</Badge>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-foreground">Hard Mode</h3>
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
                className="w-full bg-[hsl(var(--menu-hard))] hover:bg-[hsl(var(--menu-hard))]/90 text-white font-semibold shadow-lg"
                size="lg"
                onClick={() => onSelectMode("hard")}
              >
                Start Hard Mode
              </Button>
            </div>
          </Card>

          {/* Timed Mode */}
          <Card
            className="group relative overflow-hidden border-2 hover:border-[hsl(var(--menu-timed))] transition-all duration-300 hover:shadow-2xl hover:shadow-[hsl(var(--menu-timed))]/20 cursor-pointer hover:-translate-y-2"
            onClick={() => onSelectMode("timed")}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-timed))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[hsl(var(--menu-timed))]/10 group-hover:bg-[hsl(var(--menu-timed))]/20 transition-colors">
                  <Timer className="w-8 h-8 text-[hsl(var(--menu-timed))]" />
                </div>
                <Badge className="text-xs bg-[hsl(var(--menu-timed))] text-white">Fast</Badge>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-foreground">Timed Mode</h3>
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
                className="w-full bg-[hsl(var(--menu-timed))] hover:bg-[hsl(var(--menu-timed))]/90 text-white font-semibold shadow-lg"
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
          className="group relative overflow-hidden border-2 hover:border-[hsl(var(--menu-multiplayer))] transition-all duration-300 hover:shadow-2xl hover:shadow-[hsl(var(--menu-multiplayer))]/20 cursor-pointer hover:-translate-y-2 animate-scale-in"
          onClick={() => {
            if (!user) {
              toast.error("Please sign in or create an account to play Multiplayer modes!");
              return;
            }
            onSelectMode("multiplayer");
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--menu-multiplayer))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative p-6 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[hsl(var(--menu-multiplayer))]/10 group-hover:bg-[hsl(var(--menu-multiplayer))]/20 transition-colors">
                    <Zap className="w-8 h-8 text-[hsl(var(--menu-multiplayer))]" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-3xl font-bold text-foreground">Multiplayer Mode</h3>
                    <p className="text-sm text-muted-foreground">
                      Challenge a friend in split-screen battle
                    </p>
                  </div>
                </div>
                <Badge className="text-xs bg-[hsl(var(--menu-multiplayer))] text-white">New</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-background/50">
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                  <p className="text-sm text-muted-foreground">Real-time split screen</p>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-background/50">
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                  <p className="text-sm text-muted-foreground">See opponent's colors</p>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-background/50">
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--menu-multiplayer))]" />
                  <p className="text-sm text-muted-foreground">First to guess wins</p>
                </div>
              </div>

              <Button
                className="w-full md:w-auto bg-[hsl(var(--menu-multiplayer))] hover:bg-[hsl(var(--menu-multiplayer))]/90 text-white font-semibold shadow-lg"
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
                Start Multiplayer Game
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
