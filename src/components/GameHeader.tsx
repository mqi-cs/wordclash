import { HelpCircle, BarChart3, Lightbulb, Bot } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

interface GameHeaderProps {
  onShowHelp: () => void;
  onShowStats: () => void;
  onHint: () => void;
  availableHints: number;
  hintsDisabled: boolean;
  onToggleBot: () => void;
  botActive: boolean;
  botDisabled: boolean;
}

export const GameHeader = ({ onShowHelp, onShowStats, onHint, availableHints, hintsDisabled, onToggleBot, botActive, botDisabled }: GameHeaderProps) => {
  return (
    <header className="border-b border-border py-3 sm:py-4 px-2 sm:px-4">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onShowHelp} className="h-9 w-9 sm:h-10 sm:w-10">
          <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-wide">WORDCLASH</h1>
        <div className="flex gap-0.5 sm:gap-1 items-center">
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onHint}
              disabled={hintsDisabled}
              className="h-9 w-9 sm:h-10 sm:w-10"
            >
              <Lightbulb className="w-5 h-5 sm:w-6 sm:h-6" />
            </Button>
            {!hintsDisabled && availableHints > 0 && (
              <Badge 
                variant="secondary" 
                className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 p-0 flex items-center justify-center text-[10px] sm:text-xs bg-purple-600 text-white hover:bg-purple-600"
              >
                {availableHints}
              </Badge>
            )}
          </div>
          <Button 
            variant={botActive ? "default" : "ghost"}
            size="icon" 
            onClick={onToggleBot}
            disabled={botDisabled}
            className={cn(
              "h-9 w-9 sm:h-10 sm:w-10",
              botActive && "bg-purple-600 hover:bg-purple-700"
            )}
          >
            <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onShowStats} className="h-9 w-9 sm:h-10 sm:w-10">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>
      </div>
    </header>
  );
};
