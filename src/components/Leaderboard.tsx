import { GameMode } from "./GameMenu";
import { getGameHistory, GameResult } from "@/lib/gameHistory";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Trophy, Target } from "lucide-react";

interface LeaderboardProps {
  open: boolean;
  onClose: () => void;
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
  return date.toLocaleDateString();
};

const GameResultRow = ({ result, index }: { result: GameResult; index: number }) => {
  return (
    <div className="flex items-center justify-between rounded-[1.35rem] border border-border/70 bg-background/55 p-4 transition-colors hover:bg-accent/70">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-muted-foreground w-6">#{index + 1}</span>
        {result.won ? (
          <CheckCircle className="w-5 h-5 text-[hsl(var(--menu-classic))]" />
        ) : (
          <XCircle className="w-5 h-5 text-destructive" />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {result.won ? "Won" : "Lost"}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(result.timestamp)}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {result.mode === "timed" ? (
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold">{result.wordsCompleted || 0}</span>
            <span className="text-xs text-muted-foreground">words</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{result.guesses}</span>
            <span className="text-xs text-muted-foreground">guesses</span>
          </div>
        )}
        
        <div className="flex items-center gap-2 min-w-[80px] justify-end">
          <div className="w-4 h-4 rounded-sm bg-[hsl(var(--menu-classic))]" />
          <span className="text-sm font-bold">{result.greenLetters}</span>
        </div>
      </div>
    </div>
  );
};

const ModeLeaderboard = ({ mode }: { mode: GameMode }) => {
  const history = getGameHistory();
  const modeHistory = history[mode] || [];

  if (modeHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">No games played yet in {mode} mode</p>
        <p className="text-sm text-muted-foreground mt-2">Start playing to see your history!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {modeHistory.map((result, index) => (
        <GameResultRow key={result.timestamp} result={result} index={index} />
      ))}
    </div>
  );
};

export const Leaderboard = ({ open, onClose }: LeaderboardProps) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto border-border/70 bg-card/90">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Game History
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex gap-4 text-xs text-muted-foreground justify-end px-4">
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              Guesses/Words
            </span>
            <span className="flex items-center gap-1 min-w-[80px] justify-end">
              <div className="w-3 h-3 rounded-sm bg-[hsl(var(--menu-classic))]" />
              Green Letters
            </span>
          </div>
          
          <Tabs defaultValue="classic" className="w-full">
            <TabsList className="grid w-full grid-cols-3 rounded-2xl border border-border/70 bg-background/60 p-1">
              <TabsTrigger value="classic">Classic</TabsTrigger>
              <TabsTrigger value="hard">Hard</TabsTrigger>
              <TabsTrigger value="timed">Timed</TabsTrigger>
            </TabsList>
            
            <TabsContent value="classic" className="mt-4">
              <ModeLeaderboard mode="classic" />
            </TabsContent>
            
            <TabsContent value="hard" className="mt-4">
              <ModeLeaderboard mode="hard" />
            </TabsContent>
            
            <TabsContent value="timed" className="mt-4">
              <ModeLeaderboard mode="timed" />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
