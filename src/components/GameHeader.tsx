import { HelpCircle, BarChart3, Lightbulb } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface GameHeaderProps {
  onShowHelp: () => void;
  onShowStats: () => void;
  onHint: () => void;
  availableHints: number;
  hintsDisabled: boolean;
}

export const GameHeader = ({ onShowHelp, onShowStats, onHint, availableHints, hintsDisabled }: GameHeaderProps) => {
  return (
    <header className="border-b border-border py-4 px-4">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onShowHelp}>
          <HelpCircle className="w-6 h-6" />
        </Button>
        <h1 className="text-3xl font-bold tracking-wide">WORDLE</h1>
        <div className="flex gap-1 items-center">
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onHint}
              disabled={hintsDisabled || availableHints === 0}
            >
              <Lightbulb className="w-6 h-6" />
            </Button>
            {!hintsDisabled && availableHints > 0 && (
              <Badge 
                variant="secondary" 
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-purple-600 text-white hover:bg-purple-600"
              >
                {availableHints}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onShowStats}>
            <BarChart3 className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </header>
  );
};
