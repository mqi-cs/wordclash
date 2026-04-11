import { HelpCircle, BarChart3, Lightbulb, Bot } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";
import { FeatureDiscoveryHalo } from "@/components/FeatureWalkthrough";

interface GameHeaderProps {
  onShowHelp: () => void;
  onShowStats: () => void;
  onHint: () => void;
  availableHints: number;
  hintsDisabled: boolean;
  onToggleBot: () => void;
  botActive: boolean;
  botDisabled: boolean;
  highlightHints?: boolean;
  highlightBot?: boolean;
}

export const GameHeader = ({
  onShowHelp,
  onShowStats,
  onHint,
  availableHints,
  hintsDisabled,
  onToggleBot,
  botActive,
  botDisabled,
  highlightHints = false,
  highlightBot = false,
}: GameHeaderProps) => {
  return (
    <header className="border-b border-border/80 bg-background/65 px-2 py-2 backdrop-blur-sm sm:px-4 sm:py-3">
      <div className="mx-auto max-w-3xl space-y-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="justify-self-start">
          <Button variant="ghost" size="icon" onClick={onShowHelp} className="h-9 w-9 sm:h-10 sm:w-10">
            <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>
        <h1 className="bg-gradient-to-r from-foreground to-primary/75 bg-clip-text text-center text-2xl font-bold tracking-[0.24em] text-transparent sm:text-3xl">
          WORDCLASH
        </h1>
        <div className="flex items-center justify-self-end gap-0.5 sm:gap-1">
          <ThemeToggle className="h-9 w-9 sm:h-10 sm:w-10" />
          <Button variant="ghost" size="icon" onClick={onShowStats} className="h-9 w-9 sm:h-10 sm:w-10">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3">
        <div className="relative">
          {highlightHints && <FeatureDiscoveryHalo accentVar="menu-timed" />}
          <Button
            id="game-hint-button"
            variant="outline"
            onClick={onHint}
            disabled={hintsDisabled}
            className="h-11 w-full justify-start gap-2 rounded-xl border-purple-500/30 bg-purple-500/10 px-3 text-left text-purple-200 hover:bg-purple-500/15 hover:text-purple-100 sm:h-12 sm:gap-3 sm:px-4"
          >
            <Lightbulb className="h-4 w-4 text-purple-300 sm:h-5 sm:w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] sm:text-sm">Hint</span>
          </Button>
          {!hintsDisabled && availableHints > 0 && (
            <Badge
              variant="secondary"
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center border-0 bg-primary px-1.5 text-[10px] text-primary-foreground hover:bg-primary sm:h-6 sm:min-w-6 sm:text-xs"
            >
              {availableHints}
            </Badge>
          )}
        </div>
        <div className="relative">
          {highlightBot && <FeatureDiscoveryHalo accentVar="menu-classic" />}
          <Button
            id="game-bot-button"
            variant={botActive ? "default" : "outline"}
            onClick={onToggleBot}
            disabled={botDisabled}
            className={cn(
              "h-11 w-full justify-start gap-2 rounded-xl px-3 text-left sm:h-12 sm:gap-3 sm:px-4",
              botActive
                ? "bg-red-600 text-white hover:bg-red-600/90"
                : "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100"
            )}
          >
            <Bot className="h-4 w-4 text-red-300 sm:h-5 sm:w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] sm:text-sm">
              {botActive ? "Bot On" : "Word Bot"}
            </span>
          </Button>
        </div>
      </div>
      </div>
    </header>
  );
};
