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
    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-muted-foreground w-6">#{index + 1}</span>
        {result.won ? (
          <CheckCircle className="w-5 h-5 text-green-600" />
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
            <Trophy className="w-4 h-4 text-amber-600" />
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
          <div className="w-4 h-4 bg-green-600 rounded-sm" />
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-600" />
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
              <div className="w-3 h-3 bg-green-600 rounded-sm" />
              Green Letters
            </span>
          </div>
          
          <Tabs defaultValue="classic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
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
