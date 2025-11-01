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
        "w-11 h-11 sm:w-14 sm:h-14 border-2 flex items-center justify-center text-xl sm:text-2xl font-bold uppercase transition-all duration-100",
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
  maxGuesses: number;
  wordLength: number;
  shake?: boolean;
  revealedHints: number[];
  targetWord: string;
}

export const GameGrid = ({
  guesses,
  currentGuess,
  evaluations,
  maxGuesses,
  wordLength,
  shake,
  revealedHints,
  targetWord,
}: GameGridProps) => {
  const rows = Array.from({ length: maxGuesses }, (_, i) => {
    if (i < guesses.length) {
      // Completed guess
      return Array.from({ length: wordLength }, (_, j) => ({
        letter: guesses[i][j] || "",
        status: evaluations[i][j],
        animate: true,
        delay: j * 150,
      }));
    } else if (i === guesses.length) {
      // Current guess with hints
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
    <div className="flex flex-col gap-1 sm:gap-1.5 my-4 sm:my-8">
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-1 sm:gap-1.5 justify-center",
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
