import { isValidWord } from "./wordList";
import validWordsRaw from './validWords.txt?raw';

// Get all valid words for the bot to choose from
const ALL_WORDS = validWordsRaw
  .trim()
  .split('\n')
  .map(word => word.trim().toUpperCase())
  .filter(word => word.length === 5);

export interface BotState {
  greenLetters: Map<number, string>; // position -> letter
  yellowLetters: Map<string, Set<number>>; // letter -> positions where it was yellow
  greyLetters: Set<string>;
}

export const getInitialBotState = (): BotState => ({
  greenLetters: new Map(),
  yellowLetters: new Map(),
  greyLetters: new Set(),
});

export const updateBotState = (
  state: BotState,
  guess: string,
  evaluation: Array<"correct" | "present" | "absent">
): BotState => {
  const newState = {
    greenLetters: new Map(state.greenLetters),
    yellowLetters: new Map(state.yellowLetters),
    greyLetters: new Set(state.greyLetters),
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
      // Only mark as grey if it's not green or yellow anywhere
      const isGreen = Array.from(newState.greenLetters.values()).includes(letter);
      const isYellow = newState.yellowLetters.has(letter);
      if (!isGreen && !isYellow) {
        newState.greyLetters.add(letter);
      }
    }
  });

  return newState;
};

export const getBotNextGuess = (state: BotState, isHardMode: boolean = false): string | null => {
  const candidates = ALL_WORDS.filter(word => {
    // Check grey letters - word shouldn't contain any grey letters
    for (const greyLetter of state.greyLetters) {
      if (word.includes(greyLetter)) {
        return false;
      }
    }

    // Check green letters - word must have green letters in correct positions
    for (const [position, letter] of state.greenLetters.entries()) {
      if (word[position] !== letter) {
        return false;
      }
    }

    // Check yellow letters - word must contain yellow letters but not in their yellow positions
    // Note: In hard mode, there are no yellow letters (only correct/absent), so this check is skipped
    if (!isHardMode) {
      for (const [letter, yellowPositions] of state.yellowLetters.entries()) {
        // Word must contain this letter
        if (!word.includes(letter)) {
          return false;
        }

        // Letter must not be in any of the yellow positions
        for (const position of yellowPositions) {
          if (word[position] === letter) {
            return false;
          }
        }

        // Letter must not be in a green position (already handled by green check, but double-check)
        for (const [greenPos, greenLetter] of state.greenLetters.entries()) {
          if (letter === greenLetter && word[greenPos] !== letter) {
            return false;
          }
        }
      }
    }

    return true;
  });

  if (candidates.length === 0) {
    return null;
  }

  // Return a random candidate from the filtered list
  return candidates[Math.floor(Math.random() * candidates.length)];
};
