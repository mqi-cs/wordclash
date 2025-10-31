import { HelpCircle, BarChart3, Lightbulb } from "lucide-react";
import { Button } from "./ui/button";

interface GameHeaderProps {
  onShowHelp: () => void;
  onShowStats: () => void;
  onHint: () => void;
}

export const GameHeader = ({ onShowHelp, onShowStats, onHint }: GameHeaderProps) => {
  return (
    <header className="border-b border-border py-4 px-4">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onShowHelp}>
          <HelpCircle className="w-6 h-6" />
        </Button>
        <h1 className="text-3xl font-bold tracking-wide">WORDLE</h1>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onHint}>
            <Lightbulb className="w-6 h-6" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onShowStats}>
            <BarChart3 className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </header>
  );
};
