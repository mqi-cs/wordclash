// Shared game logic that can be used by both client-side and Convex server-side code.
// This file must NOT import anything that uses Vite-specific features (like ?raw imports).

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

// Common 5-letter words used to select the target word for multiplayer games
export const TARGET_WORDS = [
  "ABOUT", "ABOVE", "ABUSE", "ACTOR", "ACUTE", "ADMIT", "ADOPT", "ADULT", "AFTER", "AGAIN",
  "AGENT", "AGREE", "AHEAD", "ALARM", "ALBUM", "ALERT", "ALIKE", "ALIVE", "ALLOW", "ALONE",
  "ALONG", "ALTER", "ANGEL", "ANGER", "ANGLE", "ANGRY", "APART", "APPLE", "APPLY", "ARENA",
  "ARGUE", "ARISE", "ARRAY", "ASIDE", "ASSET", "AUDIO", "AVOID", "AWARD", "AWARE", "BADLY",
  "BAKER", "BASES", "BASIC", "BASIS", "BEACH", "BEGAN", "BEGIN", "BEGUN", "BEING", "BELOW",
  "BENCH", "BILLY", "BIRTH", "BLACK", "BLADE", "BLAME", "BLIND", "BLOCK", "BLOOD", "BOARD",
  "BOOST", "BOOTH", "BOUND", "BRAIN", "BRAND", "BREAD", "BREAK", "BREED", "BRIEF", "BRING",
  "BROAD", "BROKE", "BROWN", "BUILD", "BUILT", "BUYER", "CABLE", "CARRY", "CATCH",
  "CAUSE", "CHAIN", "CHAIR", "CHAOS", "CHARM", "CHART", "CHASE", "CHEAP", "CHECK", "CHEST",
  "CHIEF", "CHILD", "CHOSE", "CIVIL", "CLAIM", "CLASS", "CLEAN", "CLEAR", "CLICK",
  "CLOCK", "CLOSE", "COACH", "COAST", "COULD", "COUNT", "COURT", "COVER", "CRAFT", "CRASH",
  "CRAZY", "CREAM", "CRIME", "CROSS", "CROWD", "CROWN", "CRUDE", "CURVE", "CYCLE", "DAILY",
  "DANCE", "DATED", "DEALT", "DEATH", "DEBUT", "DELAY", "DEPTH", "DOING", "DOUBT", "DOZEN",
  "DRAFT", "DRAMA", "DRANK", "DRAWN", "DREAM", "DRESS", "DRILL", "DRINK", "DRIVE", "DROVE",
  "DYING", "EAGER", "EARLY", "EARTH", "EIGHT", "ELITE", "EMPTY", "ENEMY", "ENJOY", "ENTER",
  "ENTRY", "EQUAL", "ERROR", "EVENT", "EVERY", "EXACT", "EXIST", "EXTRA", "FAITH", "FALSE",
  "FAULT", "FIBER", "FIELD", "FIFTH", "FIFTY", "FIGHT", "FINAL", "FIRST", "FIXED", "FLASH",
  "FLEET", "FLOOR", "FLUID", "FOCUS", "FORCE", "FORTH", "FORTY", "FORUM", "FOUND", "FRAME",
  "FRANK", "FRAUD", "FRESH", "FRONT", "FRUIT", "FULLY", "FUNNY", "GIANT", "GIVEN", "GLASS",
  "GLOBE", "GOING", "GRACE", "GRADE", "GRAND", "GRANT", "GRASS", "GREAT", "GREEN", "GROSS",
  "GROUP", "GROWN", "GUARD", "GUESS", "GUEST", "GUIDE", "HAPPY", "HEART", "HEAVY",
  "HENCE", "HORSE", "HOTEL", "HOUSE", "HUMAN", "IDEAL", "IMAGE", "INDEX", "INNER",
  "INPUT", "ISSUE", "JOINT", "JUDGE", "KNOWN", "LABEL", "LARGE",
  "LASER", "LATER", "LAUGH", "LAYER", "LEARN", "LEASE", "LEAST", "LEAVE", "LEGAL", "LEMON",
  "LEVEL", "LIGHT", "LIMIT", "LINKS", "LIVES", "LOCAL", "LOGIC", "LOOSE", "LOWER",
  "LUCKY", "LUNCH", "LYING", "MAGIC", "MAJOR", "MAKER", "MARCH", "MATCH", "MAYBE",
  "MAYOR", "MEANT", "MEDIA", "METAL", "MIGHT", "MINOR", "MINUS", "MIXED", "MODEL", "MONEY",
  "MONTH", "MORAL", "MOTOR", "MOUNT", "MOUSE", "MOUTH", "MOVIE", "MUSIC", "NEEDS", "NEVER",
  "NEWLY", "NIGHT", "NOISE", "NORTH", "NOTED", "NOVEL", "NURSE", "OCCUR", "OCEAN", "OFFER",
  "OFTEN", "ORDER", "OTHER", "OUGHT", "PAINT", "PANEL", "PAPER", "PARTY", "PEACE",
  "PHASE", "PHONE", "PHOTO", "PIECE", "PILOT", "PITCH", "PLACE", "PLAIN", "PLANE", "PLANT",
  "PLATE", "POINT", "POUND", "POWER", "PRESS", "PRICE", "PRIDE", "PRIME", "PRINT", "PRIOR",
  "PRIZE", "PROOF", "PROUD", "PROVE", "QUEEN", "QUICK", "QUIET", "QUITE", "RADIO", "RAISE",
  "RANGE", "RAPID", "RATIO", "REACH", "READY", "REFER", "RIGHT", "RIVAL", "RIVER",
  "ROUGH", "ROUND", "ROUTE", "ROYAL", "RURAL", "SCALE", "SCENE", "SCOPE",
  "SCORE", "SENSE", "SERVE", "SEVEN", "SHALL", "SHAPE", "SHARE", "SHARP", "SHEET", "SHELF",
  "SHELL", "SHIFT", "SHINE", "SHIRT", "SHOCK", "SHOOT", "SHORT", "SHOWN", "SIGHT", "SINCE",
  "SIXTH", "SIXTY", "SIZED", "SKILL", "SLEEP", "SLIDE", "SMALL", "SMART", "SMILE", "SMITH",
  "SMOKE", "SOLID", "SOLVE", "SORRY", "SOUND", "SOUTH", "SPACE", "SPARE", "SPEAK", "SPEED",
  "SPEND", "SPENT", "SPLIT", "SPOKE", "SPORT", "STAFF", "STAGE", "STAKE", "STAND", "START",
  "STATE", "STEAM", "STEEL", "STICK", "STILL", "STOCK", "STONE", "STOOD", "STORE", "STORM",
  "STORY", "STRIP", "STUCK", "STUDY", "STUFF", "STYLE", "SUGAR", "SUITE", "SUPER", "SWEET",
  "TABLE", "TAKEN", "TASTE", "TAXES", "TEACH", "THANK", "THEFT", "THEIR",
  "THEME", "THERE", "THESE", "THICK", "THING", "THINK", "THIRD", "THOSE", "THREE", "THREW",
  "THROW", "TIGHT", "TIMES", "TITLE", "TODAY", "TOPIC", "TOTAL", "TOUCH", "TOUGH", "TOWER",
  "TRACK", "TRADE", "TRAIN", "TREAT", "TREND", "TRIAL", "TRIBE", "TRICK", "TRIED", "TRIES",
  "TROOP", "TRUCK", "TRULY", "TRUNK", "TRUST", "TRUTH", "TWICE", "UNDER", "UNDUE", "UNION",
  "UNITY", "UNTIL", "UPPER", "URBAN", "USAGE", "USUAL", "VALID", "VALUE", "VIDEO", "VIRUS",
  "VISIT", "VITAL", "VOCAL", "VOICE", "WASTE", "WATCH", "WATER", "WHEEL", "WHERE", "WHICH",
  "WHILE", "WHITE", "WHOLE", "WHOSE", "WOMAN", "WOMEN", "WORLD", "WORRY", "WORSE", "WORST",
  "WORTH", "WOULD", "WOUND", "WRITE", "WRONG", "WROTE", "YOUNG", "YOUTH",
];

export const getRandomTargetWord = (): string => {
  return TARGET_WORDS[Math.floor(Math.random() * TARGET_WORDS.length)];
};

// Simple validation: is the word exactly 5 uppercase letters?
// For full dictionary validation, the client word list should be used.
// This provides basic server-side sanity checking.
export const isValidGuessFormat = (word: string): boolean => {
  return /^[A-Z]{5}$/.test(word.toUpperCase());
};
