import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Delete } from "lucide-react";

interface KeyboardProps {
  onKeyPress: (key: string) => void;
  onEnter: () => void;
  onDelete: () => void;
  letterStatus: Record<string, "correct" | "present" | "absent" | undefined>;
}

const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
];

export const Keyboard = ({ onKeyPress, onEnter, onDelete, letterStatus }: KeyboardProps) => {
  const handleClick = (key: string) => {
    if (key === "ENTER") {
      onEnter();
    } else if (key === "⌫") {
      onDelete();
    } else {
      onKeyPress(key);
    }
  };

  const getKeyStatus = (key: string) => {
    if (key === "ENTER" || key === "⌫") return undefined;
    return letterStatus[key];
  };

  return (
    <div className="w-full max-w-lg mx-auto mt-4 sm:mt-8 px-1 sm:px-2">
      {KEYBOARD_ROWS.map((row, i) => (
        <div key={i} className="flex gap-1 sm:gap-1.5 justify-center mb-1.5 sm:mb-2">
          {row.map((key) => {
            const status = getKeyStatus(key);
            return (
              <Button
                key={key}
                onClick={() => handleClick(key)}
                className={cn(
                  "h-12 sm:h-14 font-semibold text-xs sm:text-sm transition-colors",
                  key === "ENTER" || key === "⌫" ? "px-2 sm:px-4 text-[10px] sm:text-sm" : "px-2 sm:px-3 min-w-[32px] sm:min-w-[40px]",
                  !status && "bg-game-key-bg hover:bg-muted text-game-text",
                  status === "correct" && "bg-game-correct hover:bg-game-correct text-white",
                  status === "present" && "bg-game-present hover:bg-game-present text-white",
                  status === "absent" && "bg-game-absent hover:bg-game-absent text-white"
                )}
              >
                {key === "⌫" ? <Delete className="w-4 h-4 sm:w-5 sm:h-5" /> : key}
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
