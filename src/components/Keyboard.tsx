import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Delete, X } from "lucide-react";

interface KeyboardProps {
  onKeyPress: (key: string) => void;
  onEnter: () => void;
  onDelete: () => void;
  letterStatus: Record<string, "correct" | "present" | "absent" | undefined>;
  disabled?: boolean;
  eliminatedLetters?: string[];
}

const DELETE_KEY = "\u232b";

const KEYBOARD_ROWS = [
  [DELETE_KEY, "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M", "ENTER"],
];

export const Keyboard = ({
  onKeyPress,
  onEnter,
  onDelete,
  letterStatus,
  disabled = false,
  eliminatedLetters = [],
}: KeyboardProps) => {
  const handleClick = (key: string) => {
    if (disabled) return;
    if (key === "ENTER") {
      onEnter();
    } else if (key === DELETE_KEY) {
      onDelete();
    } else {
      onKeyPress(key);
    }
  };

  const getKeyStatus = (key: string) => {
    if (key === "ENTER" || key === DELETE_KEY) return undefined;
    return letterStatus[key];
  };

  return (
    <div className="w-full max-w-sm mx-auto px-1">
      {KEYBOARD_ROWS.map((row, i) => (
        <div key={i} className="mb-0.5 flex justify-center gap-0.5 sm:gap-1">
          {row.map((key) => {
            const status = getKeyStatus(key);
            const isEliminated = eliminatedLetters.includes(key);
            return (
              <Button
                key={key}
                onClick={() => handleClick(key)}
                disabled={disabled}
                className={cn(
                  "relative h-9 sm:h-11 font-semibold text-[11px] sm:text-sm transition-colors overflow-hidden",
                  key === "ENTER" || key === DELETE_KEY
                    ? "px-2 sm:px-2.5 text-[10px] sm:text-sm"
                    : "min-w-[27px] px-1.5 sm:min-w-[34px] sm:px-2",
                  !status && "bg-game-key-bg text-game-text hover:bg-muted",
                  status === "correct" && "bg-game-correct text-white hover:bg-game-correct",
                  status === "present" && "bg-game-present text-white hover:bg-game-present",
                  status === "absent" && "bg-game-absent text-white hover:bg-game-absent",
                  disabled && "cursor-not-allowed opacity-50"
                )}
              >
                {key === DELETE_KEY ? <Delete className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : key}
                {isEliminated && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-0.5 sm:p-1">
                    <X className="!w-full !h-full text-red-500 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)] opacity-95" strokeWidth={3} />
                  </div>
                )}
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
