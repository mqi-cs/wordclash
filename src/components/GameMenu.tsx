import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Zap, Target } from "lucide-react";

export type GameMode = "classic" | "hard" | "timed";

interface GameMenuProps {
  onSelectMode: (mode: GameMode) => void;
}

export const GameMenu = ({ onSelectMode }: GameMenuProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold text-foreground">Wordle</h1>
          <p className="text-muted-foreground">Choose your game mode</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onSelectMode("classic")}>
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Classic</CardTitle>
              <CardDescription>6 guesses to find the word</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => onSelectMode("classic")}>
                Play Classic
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onSelectMode("hard")}>
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
                <Zap className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>Hard Mode</CardTitle>
              <CardDescription>10 guesses, no yellow hints</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="destructive" onClick={() => onSelectMode("hard")}>
                Play Hard
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onSelectMode("timed")}>
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary/10 mb-4">
                <Clock className="w-6 h-6 text-secondary-foreground" />
              </div>
              <CardTitle>Timed Mode</CardTitle>
              <CardDescription>90 seconds, +30s per word</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="secondary" onClick={() => onSelectMode("timed")}>
                Play Timed
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
