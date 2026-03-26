import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface TileProps {
  letter: string;
  status: "empty" | "filled" | "correct" | "present" | "absent";
  animate?: boolean;
  delay?: number;
  isHint?: boolean;
  blurLetter?: boolean;
}

const Tile = ({ letter, status, animate, delay = 0, isHint, blurLetter = false }: TileProps) => {
  return (
    <div
      className={cn(
        "aspect-square w-full border-2 flex items-center justify-center text-[1.65rem] sm:text-[2.1rem] font-bold uppercase transition-all duration-100",
        status === "empty" && "border-game-border bg-game-empty",
        status === "filled" && "border-game-border-active bg-game-empty animate-bounce-in",
        status === "correct" && "bg-game-correct border-game-correct text-white",
        status === "present" && "bg-game-present border-game-present text-white",
        status === "absent" && "bg-game-absent border-game-absent text-white",
        animate && "animate-flip",
        isHint && "bg-purple-600 border-purple-600 text-white"
      )}
      style={{
        ...(animate ? { animationDelay: `${delay}ms` } : {}),
        ...(blurLetter ? { filter: "blur(8px)" } : {}),
      }}
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
  hintActivated?: boolean;
  blurCompletedGuesses?: boolean;
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
  hintActivated = false,
  blurCompletedGuesses = false,
}: GameGridProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sixRowViewportHeight = "calc(6 * min(16vw, 70px) + 5 * 8px)";

  // For modes with many guesses (hard=10, timed=999), we show a scrollable window.
  // We always render all rows but keep a 6-row viewport visible.
  const needsScroll = maxGuesses > 6;

  // Prevent rendering 999 empty rows in timed mode by clamping the display row count
  const displayRows = maxGuesses > 20 ? Math.max(6, guesses.length + 2) : maxGuesses;

  // Auto-scroll to keep the current row visible
  useEffect(() => {
    if (needsScroll && scrollRef.current) {
      const container = scrollRef.current;
      // Scroll to show the current active row near the bottom of the viewport
      const rowHeight = container.scrollHeight / displayRows;
      const targetScroll = Math.max(0, (guesses.length - 3) * rowHeight);
      container.scrollTo({ top: targetScroll, behavior: "smooth" });
    }
  }, [guesses.length, needsScroll, displayRows]);

  const rows = Array.from({ length: displayRows }, (_, i) => {
    if (i < guesses.length) {
      // Completed guess
      return Array.from({ length: wordLength }, (_, j) => ({
        letter: guesses[i][j] || "",
        status: evaluations[i][j],
        animate: !isOpponent,
        delay: j * 150,
        blurLetter: blurCompletedGuesses,
      }));
    } else if (i === guesses.length && !isOpponent) {
      // Current guess with hints (only for the actual player)
      return Array.from({ length: wordLength }, (_, j) => ({
        letter: currentGuess[j] || (hintActivated && revealedHints.includes(j) ? targetWord[j] : ""),
        status: currentGuess[j] ? ("filled" as const) : ("empty" as const),
        isHint: !currentGuess[j] && hintActivated && revealedHints.includes(j),
      }));
    } else {
      // Empty row
      return Array.from({ length: wordLength }, () => ({
        letter: "",
        status: "empty" as const,
      }));
    }
  });

  const gridContent = (
    <div className="flex flex-col gap-1.5 sm:gap-2 w-full">
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

  if (needsScroll) {
    // Scrollable viewport: always reserve space for 6 visible rows.
    return (
      <div
        className="w-full max-w-[290px] sm:max-w-[352px] mx-auto"
        style={{ minHeight: sixRowViewportHeight }}
      >
        <div
          ref={scrollRef}
          className="overflow-y-auto scrollbar-hide"
          style={{
            height: sixRowViewportHeight,
            minHeight: sixRowViewportHeight,
          }}
        >
          {gridContent}
        </div>
      </div>
    );
  }

  // Standard fixed grid (6 rows for classic or multiplayer)
  return (
    <div
      className="w-full max-w-[290px] sm:max-w-[352px] mx-auto"
      style={{ minHeight: sixRowViewportHeight }}
    >
      {gridContent}
    </div>
  );
};
