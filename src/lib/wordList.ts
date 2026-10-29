// The word lists live in convex/shared so the server validates guesses and
// picks answers from exactly the same lists the client uses.
import { getRandomTargetWord } from "../../convex/shared/gameLogic";

export { VALID_WORDS, isValidWord } from "../../convex/shared/words";

// Get a random word from the common target words list
export const getRandomWord = (): string => getRandomTargetWord();
