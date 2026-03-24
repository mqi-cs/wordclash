import { cn } from "@/lib/utils";

interface TileProps {
  letter: string;
  status: "empty" | "filled" | "correct" | "present" | "absent";
  animate?: boolean;
  delay?: number;
  isHint?: boolean;
}

const Tile = ({ letter, status, animate, delay = 0, isHint }: TileProps) => {
  return (
    <div
      className={cn(
        "aspect-square w-full border-2 flex items-center justify-center text-2xl sm:text-3xl font-bold uppercase transition-all duration-100",
        status === "empty" && "border-game-border bg-game-empty",
        status === "filled" && "border-game-border-active bg-game-empty animate-bounce-in",
        status === "correct" && "bg-game-correct border-game-correct text-white",
        status === "present" && "bg-game-present border-game-present text-white",
        status === "absent" && "bg-game-absent border-game-absent text-white",
        animate && "animate-flip",
        isHint && "bg-purple-600 border-purple-600 text-white"
      )}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
    >
      {letter}
    </div>
  );
};

interface GameGridProps {
  guesses: string[];
  currentGuess: string;
  evaluations: Array<Array<"correct" | "present" | "absent">>;
  maxGuesses?: number;
  wordLength?: number;
  shake?: boolean;
  revealedHints?: number[];
  targetWord?: string;
  isOpponent?: boolean;
}

export const GameGrid = ({
  guesses,
  currentGuess,
  evaluations,
  maxGuesses = 6,
  wordLength = 5,
  shake,
  revealedHints = [],
  targetWord = "",
  isOpponent = false,
}: GameGridProps) => {
  // Prevent rendering 999 empty rows in timed mode by clamping the display rows
  const displayRows = maxGuesses > 20 ? Math.max(6, guesses.length + 1) : maxGuesses;

  const rows = Array.from({ length: displayRows }, (_, i) => {
    if (i < guesses.length) {
      // Completed guess
      return Array.from({ length: wordLength }, (_, j) => ({
        letter: guesses[i][j] || "",
        status: evaluations[i][j],
        animate: !isOpponent,
        delay: j * 150,
      }));
    } else if (i === guesses.length && !isOpponent) {
      // Current guess with hints (only for the actual player)
      return Array.from({ length: wordLength }, (_, j) => ({
        letter: currentGuess[j] || (revealedHints.includes(j) ? targetWord[j] : ""),
        status: currentGuess[j] ? ("filled" as const) : ("empty" as const),
        isHint: !currentGuess[j] && revealedHints.includes(j),
      }));
    } else {
      // Empty row
      return Array.from({ length: wordLength }, () => ({
        letter: "",
        status: "empty" as const,
      }));
    }
  });

  return (
    <div className="flex flex-col gap-1.5 sm:gap-2 w-full max-w-[350px] sm:max-w-[450px] mx-auto my-2 sm:my-4">
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "grid grid-cols-5 gap-1.5 sm:gap-2",
            shake && i === guesses.length && "animate-shake"
          )}
        >
          {row.map((tile, j) => (
            <Tile key={j} {...tile} />
          ))}
        </div>
      ))}
    </div>
  );
};
