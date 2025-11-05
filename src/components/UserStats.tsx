import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Target, Flame } from "lucide-react";

interface UserStats {
  classic_played: number;
  classic_won: number;
  hard_played: number;
  hard_won: number;
  timed_played: number;
  timed_won: number;
  multiplayer_played: number;
  multiplayer_won: number;
  current_streak: number;
  best_streak: number;
}

export const UserStats = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const { data: statsData } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (statsData) setStats(statsData);
      if (profileData) setUsername(profileData.username);
    };

    fetchStats();
  }, [user]);

  if (!user || !stats) return null;

  const totalGames =
    stats.classic_played +
    stats.hard_played +
    stats.timed_played +
    stats.multiplayer_played;
  const totalWins =
    stats.classic_won +
    stats.hard_won +
    stats.timed_won +
    stats.multiplayer_won;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-center">{username}'s Stats</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{winRate}%</div>
            <p className="text-xs text-muted-foreground">
              {totalWins} wins / {totalGames} games
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Streak</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.current_streak}</div>
            <p className="text-xs text-muted-foreground">games in a row</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Streak</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.best_streak}</div>
            <p className="text-xs text-muted-foreground">personal best</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Game Mode Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Classic Mode:</span>
            <span>
              {stats.classic_won}/{stats.classic_played} (
              {stats.classic_played > 0
                ? Math.round((stats.classic_won / stats.classic_played) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="flex justify-between">
            <span>Hard Mode:</span>
            <span>
              {stats.hard_won}/{stats.hard_played} (
              {stats.hard_played > 0
                ? Math.round((stats.hard_won / stats.hard_played) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="flex justify-between">
            <span>Timed Mode:</span>
            <span>
              {stats.timed_won}/{stats.timed_played} (
              {stats.timed_played > 0
                ? Math.round((stats.timed_won / stats.timed_played) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="flex justify-between">
            <span>Multiplayer:</span>
            <span>
              {stats.multiplayer_won}/{stats.multiplayer_played} (
              {stats.multiplayer_played > 0
                ? Math.round((stats.multiplayer_won / stats.multiplayer_played) * 100)
                : 0}
              %)
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
