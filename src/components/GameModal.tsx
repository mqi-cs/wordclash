import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";

interface GameModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export const GameModal = ({ open, onClose, title, description, children }: GameModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
};

interface ResultModalProps {
  open: boolean;
  onClose: () => void;
  won: boolean;
  word: string;
  guesses: number;
  onPlayAgain: () => void;
}

export const ResultModal = ({ open, onClose, won, word, guesses, onPlayAgain }: ResultModalProps) => {
  return (
    <GameModal
      open={open}
      onClose={onClose}
      title={won ? "🎉 Congratulations!" : "Game Over"}
      description={won ? `You guessed the word in ${guesses} ${guesses === 1 ? "try" : "tries"}!` : `The word was: ${word}`}
    >
      <div className="flex flex-col gap-4">
        <Button onClick={onPlayAgain} className="w-full">
          Play Again
        </Button>
      </div>
    </GameModal>
  );
};

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export const HelpModal = ({ open, onClose }: HelpModalProps) => {
  return (
    <GameModal open={open} onClose={onClose} title="How to Play">
      <div className="space-y-4 text-sm">
        <p>Guess the WORDLE in 6 tries.</p>
        <p>Each guess must be a valid 5-letter word. Hit the enter button to submit.</p>
        <p>After each guess, the color of the tiles will change to show how close your guess was to the word.</p>
        
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-game-correct flex items-center justify-center text-white font-bold">
              W
            </div>
            <p>The letter W is in the word and in the correct spot.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-game-present flex items-center justify-center text-white font-bold">
              I
            </div>
            <p>The letter I is in the word but in the wrong spot.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-game-absent flex items-center justify-center text-white font-bold">
              U
            </div>
            <p>The letter U is not in the word in any spot.</p>
          </div>
        </div>
      </div>
    </GameModal>
  );
};
