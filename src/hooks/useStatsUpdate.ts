import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { GameMode } from "@/components/GameMenu";

export const useStatsUpdate = () => {
  const updateStatsMutation = useMutation(api.stats.updateStats);

  const updateStats = async (
    mode: GameMode,
    won: boolean,
    greenLetters: number,
    gameId?: string,
    gameType?: "solo" | "bot" | "multiplayer",
  ) => {
    try {
      await updateStatsMutation({
        mode,
        won,
        greenLetters,
        ...(gameId ? { gameId: gameId as Id<"games"> } : {}),
        ...(gameType ? { gameType } : {}),
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error updating stats:", error);
      }
    }
  };

  return { updateStats };
};
