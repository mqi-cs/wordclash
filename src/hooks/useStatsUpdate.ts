import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { GameMode } from "@/components/GameMenu";

export const useStatsUpdate = () => {
  const updateStatsMutation = useMutation(api.stats.updateStats);

  const updateStats = async (mode: GameMode, won: boolean, greenLetters: number) => {
    try {
      await updateStatsMutation({
        mode,
        won,
        greenLetters,
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error updating stats:", error);
      }
    }
  };

  return { updateStats };
};
