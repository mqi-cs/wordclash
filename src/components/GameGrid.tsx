import { cn } from "@/lib/utils";
import { CSSProperties, useEffect, useRef, useState } from "react";

interface TileProps {
  letter: string;
  status: "empty" | "filled" | "correct" | "present" | "absent";
  animate?: boolean;
  delay?: number;
  isHint?: boolean;
  blurLetter?: boolean;
}

const revealedTileStyles: Record<"correct" | "present" | "absent", CSSProperties> = {
  correct: {
    "--flip-bg": "hsl(var(--game-correct))",
    "--flip-border": "hsl(var(--game-correct))",
    "--flip-text": "#ffffff",
  } as CSSProperties,
  present: {
    "--flip-bg": "hsl(var(--game-present))",
    "--flip-border": "hsl(var(--game-present))",
    "--flip-text": "#ffffff",
  } as CSSProperties,
  absent: {
    "--flip-bg": "hsl(var(--game-absent))",
    "--flip-border": "hsl(var(--game-absent))",
    "--flip-text": "#ffffff",
  } as CSSProperties,
};

const Tile = ({ letter, status, animate, delay = 0, isHint, blurLetter = false }: TileProps) => {
  const [displayLetter, setDisplayLetter] = useState(letter);
  const tileRef = useRef<HTMLDivElement>(null);
  const shouldAnimateReveal =
    animate && (status === "correct" || status === "present" || status === "absent");

  useEffect(() => {
    const hasDecryptTheme =
      document.body.classList.contains("theme-anim-decrypt") ||
      tileRef.current?.closest(".theme-anim-decrypt") !== null;

    if (!shouldAnimateReveal || !hasDecryptTheme) {
      setDisplayLetter(letter);
      return;
    }

    // Wait for the animation delay before starting the decryption cycle
    const timeout = setTimeout(() => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
      let iterations = 0;
      const interval = setInterval(() => {
        setDisplayLetter(chars[Math.floor(Math.random() * chars.length)]);
        iterations++;
        if (iterations > 12) {
          clearInterval(interval);
          setDisplayLetter(letter);
        }
      }, 35);
      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [letter, shouldAnimateReveal, delay]);

  return (
    <div
      ref={tileRef}
      className={cn(
        "relative aspect-square w-full overflow-hidden border-2 flex items-center justify-center text-[1.72rem] sm:text-[2.1rem] font-bold uppercase transition-all duration-100 tile",
        status === "empty" && "tile-empty border-game-border bg-game-empty",
        status === "filled" && "tile-filled border-game-border-active bg-game-empty animate-bounce-in",
        !shouldAnimateReveal && status === "correct" && "tile-revealed tile-correct bg-game-correct border-game-correct text-white",
        !shouldAnimateReveal && status === "present" && "tile-revealed tile-present bg-game-present border-game-present text-white",
        !shouldAnimateReveal && status === "absent" && "tile-revealed tile-absent bg-game-absent border-game-absent text-white",
        shouldAnimateReveal && `tile-revealing tile-${status} border-game-border bg-game-empty text-game-text animate-flip-reveal`,
        isHint && "hint-tile border-primary bg-primary text-primary-foreground",
        blurLetter && "tile-obscured",
      )}
      style={{
        ...(shouldAnimateReveal ? revealedTileStyles[status] : {}),
        ...(animate ? { animationDelay: `${delay}ms` } : {}),
        ...(blurLetter ? { filter: "blur(8px)" } : {}),
      }}
    >
      {displayLetter}
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
  blurCurrentGuess?: boolean;
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
  blurCurrentGuess = false,
}: GameGridProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const sixRowViewportHeight = "calc(6 * min(17vw, 72px) + 5 * 8px)";

  // For modes with many guesses (hard=10, timed=999), we show a scrollable window.
  // We always render all rows but keep a 6-row viewport visible.
  const needsScroll = maxGuesses > 6;

  // Prevent rendering 999 empty rows in timed mode by clamping the display row count
  const displayRows = maxGuesses > 20 ? Math.max(6, guesses.length + 2) : maxGuesses;

  // Auto-scroll to keep the current row visible
  useEffect(() => {
    if (needsScroll && scrollRef.current) {
      const activeRowIndex = Math.min(guesses.length, displayRows - 1);
      const activeRow = rowRefs.current[activeRowIndex];

      if (activeRow) {
        activeRow.scrollIntoView({
          block: "nearest",
          behavior: guesses.length === 0 ? "auto" : "smooth",
        });
      }
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
        blurLetter: blurCurrentGuess && Boolean(currentGuess[j]),
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
          ref={(element) => {
            rowRefs.current[i] = element;
          }}
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
        className="mx-auto w-full max-w-[min(19rem,calc(100vw-1rem))] sm:max-w-[352px]"
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
      className="mx-auto w-full max-w-[min(19rem,calc(100vw-1rem))] sm:max-w-[352px]"
      style={{ minHeight: sixRowViewportHeight }}
    >
      {gridContent}
    </div>
  );
};
