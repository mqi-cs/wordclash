import { VALID_WORDS } from "./wordList";

const ALL_WORDS = VALID_WORDS;

export type BotDifficulty = "easy" | "medium" | "hard";

export interface BotState {
  greenLetters: Map<number, string>;
  yellowLetters: Map<string, Set<number>>;
  greyLetters: Set<string>;
  guessHistory: string[];
}

export const getInitialBotState = (): BotState => ({
  greenLetters: new Map(),
  yellowLetters: new Map(),
  greyLetters: new Set(),
  guessHistory: [],
});

export const updateBotState = (
  state: BotState,
  guess: string,
  evaluation: Array<"correct" | "present" | "absent">
): BotState => {
  const newState: BotState = {
    greenLetters: new Map(state.greenLetters),
    yellowLetters: new Map(state.yellowLetters),
    greyLetters: new Set(state.greyLetters),
    guessHistory: [...state.guessHistory, guess],
  };

  guess.split("").forEach((letter, index) => {
    const status = evaluation[index];

    if (status === "correct") {
      newState.greenLetters.set(index, letter);
    } else if (status === "present") {
      if (!newState.yellowLetters.has(letter)) {
        newState.yellowLetters.set(letter, new Set());
      }
      newState.yellowLetters.get(letter)!.add(index);
    } else if (status === "absent") {
      // Only mark grey if not already known green or yellow
      const isGreen = Array.from(newState.greenLetters.values()).includes(letter);
      const isYellow = newState.yellowLetters.has(letter);
      if (!isGreen && !isYellow) {
        newState.greyLetters.add(letter);
      }
    }
  });

  return newState;
};

// ─── Candidate Filtering ───────────────────────────────────────────────

export const filterCandidates = (state: BotState, isHardMode: boolean): string[] => {
  return ALL_WORDS.filter(word => {
    if (state.guessHistory.includes(word)) return false;

    for (const greyLetter of state.greyLetters) {
      if (word.includes(greyLetter)) return false;
    }

    for (const [position, letter] of state.greenLetters.entries()) {
      if (word[position] !== letter) return false;
    }

    if (!isHardMode) {
      for (const [letter, yellowPositions] of state.yellowLetters.entries()) {
        if (!word.includes(letter)) return false;
        for (const position of yellowPositions) {
          if (word[position] === letter) return false;
        }
      }
    }

    return true;
  });
};

// ─── Pattern Computation ───────────────────────────────────────────────

/** Returns a compact string key representing the colour pattern for a guess against a target */
const getPattern = (guess: string, target: string): string => {
  const result: number[] = [0, 0, 0, 0, 0];
  const targetLetters = target.split("");

  // First pass: green (correct)
  for (let i = 0; i < 5; i++) {
    if (guess[i] === targetLetters[i]) {
      result[i] = 2;
      targetLetters[i] = "";
    }
  }

  // Second pass: yellow (present)
  for (let i = 0; i < 5; i++) {
    if (result[i] !== 2) {
      const idx = targetLetters.indexOf(guess[i]);
      if (idx !== -1) {
        result[i] = 1;
        targetLetters[idx] = "";
      }
    }
  }

  return result.join("");
};

/** Hard-mode pattern: only correct (2) or absent (0), no yellow */
const getHardModePattern = (guess: string, target: string): string => {
  const result: number[] = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) result[i] = 2;
  }
  return result.join("");
};

// ─── Utilities ─────────────────────────────────────────────────────────

const LETTER_FREQ: Record<string, number> = {
  E: 12.7, T: 9.1, A: 8.2, O: 7.5, I: 7.0, N: 6.7, S: 6.3, H: 6.1,
  R: 6.0, D: 4.3, L: 4.0, C: 2.8, U: 2.8, M: 2.4, W: 2.4, F: 2.2,
  G: 2.0, Y: 2.0, P: 1.9, B: 1.5, V: 1.0, K: 0.8, J: 0.2, X: 0.2,
  Q: 0.1, Z: 0.1,
};

const sampleArray = <T>(arr: T[], n: number): T[] => {
  if (arr.length <= n) return arr;
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
};

// ─── EASY: Letter frequency scoring with randomness ────────────────────

const getEasyGuess = (candidates: string[]): string | null => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const scored = candidates.map(word => {
    const unique = new Set(word.split(""));
    let score = 0;
    unique.forEach(l => (score += LETTER_FREQ[l] || 0));
    // Bonus for words with more unique letters
    score += unique.size * 2;
    return { word, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick randomly from top 40% — makes it beatable
  const topN = Math.max(1, Math.floor(scored.length * 0.4));
  return scored[Math.floor(Math.random() * topN)].word;
};

// ─── MEDIUM: Expected elimination count ────────────────────────────────

const getMediumGuess = (candidates: string[], isHardMode: boolean): string | null => {
  if (candidates.length === 0) return null;
  if (candidates.length <= 2) return candidates[0];

  const targets = sampleArray(candidates, 300);
  const patternFn = isHardMode ? getHardModePattern : getPattern;

  // Only evaluate candidate words for medium (no sacrificial guesses)
  const guessPool = candidates.length > 500 ? sampleArray(candidates, 500) : candidates;

  let bestWord = candidates[0];
  let bestScore = -Infinity;

  for (const guess of guessPool) {
    const patternBuckets = new Map<string, number>();

    for (const target of targets) {
      const pattern = patternFn(guess, target);
      patternBuckets.set(pattern, (patternBuckets.get(pattern) || 0) + 1);
    }

    // Score = expected elimination = N - E[bucket size]
    // E[bucket size] = Σ (count² / N)
    let sumSquared = 0;
    for (const count of patternBuckets.values()) {
      sumSquared += count * count;
    }
    const expectedRemaining = sumSquared / targets.length;
    const score = targets.length - expectedRemaining;

    if (score > bestScore) {
      bestScore = score;
      bestWord = guess;
    }
  }

  return bestWord;
};

// ─── HARD: Entropy maximisation with full-list guessing ────────────────

const getHardDifficultyGuess = (candidates: string[], isHardMode: boolean): string | null => {
  if (candidates.length === 0) return null;
  if (candidates.length <= 2) return candidates[0];

  const targets = sampleArray(candidates, 400);
  const patternFn = isHardMode ? getHardModePattern : getPattern;

  // Key difference: consider ALL valid words as potential guesses (sacrificial guesses)
  // Mix candidates with samples from the full list for breadth
  const guessPool: string[] = candidates.length > 50
    ? [...new Set([...sampleArray(candidates, 300), ...sampleArray(ALL_WORDS, 500)])]
    : [...new Set([...candidates, ...sampleArray(ALL_WORDS, 600)])];

  let bestWord = candidates[0];
  let bestEntropy = -1;

  for (const guess of guessPool) {
    const patternCounts = new Map<string, number>();

    for (const target of targets) {
      const pattern = patternFn(guess, target);
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }

    // Shannon entropy: -Σ p·log₂(p)
    let entropy = 0;
    for (const count of patternCounts.values()) {
      const p = count / targets.length;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Tiny bonus for words that are actual candidates (tie-breaker)
    if (candidates.includes(guess)) {
      entropy += 0.01;
    }

    if (entropy > bestEntropy) {
      bestEntropy = entropy;
      bestWord = guess;
    }
  }

  return bestWord;
};

// ─── Precomputed first guesses ─────────────────────────────────────────

const STRONG_OPENER_MEDIUM = "CRANE";
const STRONG_OPENER_HARD = "SALET";

// ─── Main export ───────────────────────────────────────────────────────

export const getBotNextGuess = (
  state: BotState,
  isHardMode: boolean,
  difficulty: BotDifficulty = "easy",
  guessNumber: number = 0,
): string | null => {
  const candidates = filterCandidates(state, isHardMode);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  switch (difficulty) {
    case "easy":
      return getEasyGuess(candidates);

    case "medium":
      if (guessNumber === 0) {
        // Use a known strong opener if it's in the word list
        if (ALL_WORDS.includes(STRONG_OPENER_MEDIUM)) return STRONG_OPENER_MEDIUM;
        return getEasyGuess(candidates);
      }
      return getMediumGuess(candidates, isHardMode);

    case "hard":
      if (guessNumber === 0) {
        // Use information-theoretically optimal opener
        if (ALL_WORDS.includes(STRONG_OPENER_HARD)) return STRONG_OPENER_HARD;
        if (ALL_WORDS.includes(STRONG_OPENER_MEDIUM)) return STRONG_OPENER_MEDIUM;
        return getEasyGuess(candidates);
      }
      return getHardDifficultyGuess(candidates, isHardMode);
  }
};

// ─── Thinking delays per difficulty (ms) ───────────────────────────────

export const BOT_THINKING_DELAY: Record<BotDifficulty, number> = {
  easy: 800,
  medium: 1500,
  hard: 2200,
};
