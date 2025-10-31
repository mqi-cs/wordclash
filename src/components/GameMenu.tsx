import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Clock, Zap, Target, Trophy, Flame, Timer, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type GameMode = "classic" | "hard" | "timed";

interface GameMenuProps {
  onSelectMode: (mode: GameMode) => void;
  onShowLeaderboard: () => void;
}

export const GameMenu = ({ onSelectMode, onShowLeaderboard }: GameMenuProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex flex-col items-center justify-center p-4">
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
        </div>

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
      </div>
    </div>
  );
};
