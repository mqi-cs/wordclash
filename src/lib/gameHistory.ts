import { GameMode } from "@/components/GameMenu";

export interface GameResult {
  mode: GameMode;
  won: boolean;
  guesses: number;
  wordsCompleted?: number;
  greenLetters: number;
  timestamp: number;
}

const STORAGE_KEY = "wordle_game_history";
const MAX_HISTORY_PER_MODE = 5;

export const saveGameResult = (result: GameResult) => {
  const history = getGameHistory();
  const modeHistory = history[result.mode] || [];
  
  // Add new result at the beginning
  modeHistory.unshift(result);
  
  // Keep only last 5 games per mode
  if (modeHistory.length > MAX_HISTORY_PER_MODE) {
    modeHistory.pop();
  }
  
  history[result.mode] = modeHistory;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
};

export const getGameHistory = (): Record<GameMode, GameResult[]> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { classic: [], hard: [], timed: [], multiplayer: [] };
    return JSON.parse(stored);
  } catch {
    return { classic: [], hard: [], timed: [], multiplayer: [] };
  }
};

export const clearGameHistory = () => {
  localStorage.removeItem(STORAGE_KEY);
};
