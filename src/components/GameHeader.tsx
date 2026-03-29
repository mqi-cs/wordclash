import { HelpCircle, BarChart3, Lightbulb, Bot } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ThemeToggle } from "./ThemeToggle";
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
    <header className="border-b border-border/80 bg-background/65 px-2 py-2 backdrop-blur-sm sm:px-4 sm:py-3">
      <div className="max-w-lg mx-auto grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="justify-self-start">
          <Button variant="ghost" size="icon" onClick={onShowHelp} className="h-9 w-9 sm:h-10 sm:w-10">
            <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>
        <h1 className="bg-gradient-to-r from-foreground to-primary/75 bg-clip-text text-center text-2xl font-bold tracking-[0.24em] text-transparent sm:text-3xl">
          WORDCLASH
        </h1>
        <div className="flex gap-0.5 sm:gap-1 items-center justify-self-end">
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
                className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center border-0 bg-primary p-0 text-[10px] text-primary-foreground hover:bg-primary sm:h-5 sm:w-5 sm:text-xs"
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
              botActive && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
          <ThemeToggle className="h-9 w-9 sm:h-10 sm:w-10" />
          <Button variant="ghost" size="icon" onClick={onShowStats} className="h-9 w-9 sm:h-10 sm:w-10">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>
      </div>
    </header>
  );
};
