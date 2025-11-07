import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GameMode } from "@/components/GameMenu";

export const useStatsUpdate = () => {
  const { user } = useAuth();

  const updateStats = async (mode: GameMode, won: boolean, greenLetters: number) => {
    if (!user) return;

    try {
      // Fetch current stats
      const { data: currentStats, error: fetchError } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (fetchError) throw fetchError;

      const playedKey = `${mode}_played` as keyof typeof currentStats;
      const wonKey = `${mode}_won` as keyof typeof currentStats;

      const newStreak = won ? (currentStats.current_streak || 0) + 1 : 0;
      const newBestStreak = Math.max(newStreak, currentStats.best_streak || 0);

      // Update stats
      const { error: updateError } = await supabase
        .from("user_stats")
        .update({
          [playedKey]: (currentStats[playedKey] as number) + 1,
          [wonKey]: won ? ((currentStats[wonKey] as number) + 1) : currentStats[wonKey],
          total_green_letters: (currentStats.total_green_letters || 0) + greenLetters,
          current_streak: newStreak,
          best_streak: newBestStreak,
        })
        .eq("user_id", user.id);

      if (updateError) throw updateError;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error updating stats:", error);
      }
    }
  };

  return { updateStats };
};
