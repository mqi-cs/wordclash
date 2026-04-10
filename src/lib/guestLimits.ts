import { GameMode } from "@/components/GameMenu";

const STORAGE_KEY = "wordclash_guest_play_counts";
const GUEST_LIMIT = 3;

export const getGuestGameCount = (mode: GameMode): number => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return 0;
    const counts = JSON.parse(stored);
    return counts[mode] || 0;
  } catch {
    return 0;
  }
};

export const incrementGuestGameCount = (mode: GameMode) => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const counts = stored ? JSON.parse(stored) : {};
    counts[mode] = (counts[mode] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // Ignore storage errors
  }
};

export const isModeLimitedForGuest = (mode: GameMode, isSignedIn: boolean): boolean => {
  if (isSignedIn) return false;
  if (mode === "multiplayer") return false; // Handled by auth check already
  return getGuestGameCount(mode) >= GUEST_LIMIT;
};
