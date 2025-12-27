export type EvaluationStatus = "correct" | "present" | "absent";

export const evaluateGuess = (
    guess: string,
    target: string,
    gameMode: string | null
): EvaluationStatus[] => {
    const result: EvaluationStatus[] = [];
    const targetLetters = target.split("");
    const guessLetters = guess.split("");

    // First pass: mark correct letters
    guessLetters.forEach((letter, i) => {
        if (letter === targetLetters[i]) {
            result[i] = "correct";
            targetLetters[i] = "";
        }
    });

    // Second pass: mark present letters (skip for hard mode)
    if (gameMode !== "hard") {
        guessLetters.forEach((letter, i) => {
            if (result[i] !== "correct") {
                const targetIndex = targetLetters.indexOf(letter);
                if (targetIndex !== -1) {
                    result[i] = "present";
                    targetLetters[targetIndex] = "";
                } else {
                    result[i] = "absent";
                }
            }
        });
    } else {
        // Hard mode: only correct or absent
        guessLetters.forEach((letter, i) => {
            if (result[i] !== "correct") {
                result[i] = "absent";
            }
        });
    }

    return result;
};
