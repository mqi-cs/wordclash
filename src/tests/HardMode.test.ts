import { describe, it, expect } from 'vitest';
import { evaluateGuess } from '../lib/gameLogic';

describe('Hard Mode Logic', () => {
    it('should only return correct or absent, never present', () => {
        const target = "HELLO";
        const guess = "WATCH"; // H is present in HELLO (idx 0), but at idx 4 in WATCH.
        // H E L L O
        // W A T C H
        // All letters match nothing in position. H is present in word.

        const result = evaluateGuess(guess, target, "hard");

        // In Hard Mode:
        // W -> absent
        // A -> absent
        // T -> absent
        // C -> absent
        // H -> absent (even though it's in the word, it's not in the right spot)

        expect(result).toEqual(["absent", "absent", "absent", "absent", "absent"]);
        expect(result).not.toContain("present");
    });

    it('should mark correct letters as correct', () => {
        const target = "HELLO";
        const guess = "HELIP"; // HEL.. are correct

        const result = evaluateGuess(guess, target, "hard");

        expect(result[0]).toBe("correct"); // H
        expect(result[1]).toBe("correct"); // E
        expect(result[2]).toBe("correct"); // L
        expect(result[3]).toBe("absent");  // I
        expect(result[4]).toBe("absent");  // P
    });

    it('should handle exact matches', () => {
        const target = "STARE";
        const guess = "STARE";

        const result = evaluateGuess(guess, target, "hard");

        expect(result).toEqual(["correct", "correct", "correct", "correct", "correct"]);
    });

    it('Classic mode should still return present', () => {
        const target = "HELLO";
        const guess = "WORLD";

        const result = evaluateGuess(guess, target, "classic");

        // W -> absent
        // O -> present (exists in HELLO)
        // R -> absent
        // L -> present (exists in HELLO)
        // D -> absent

        expect(result).toContain("present");
    });
});
