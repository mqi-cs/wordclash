import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";

export const UserStats = () => {
  const { user } = useAuth();
  
  // Fetch stats directly from Convex. Null means not loaded, undefined means no stats yet.
  const stats = useQuery(api.stats.getMyStats);

  if (!user || stats === undefined) return <div className="p-4 text-center">Loading stats...</div>;
  if (stats === null) return <div className="p-4 text-center">Play a game to see your stats!</div>;

  const totalGames =
    (stats.classic_played || 0) +
    (stats.hard_played || 0) +
    (stats.timed_played || 0) +
    (stats.multiplayer_played || 0);

  const totalWins =
    (stats.classic_won || 0) +
    (stats.hard_won || 0) +
    (stats.timed_won || 0) +
    (stats.multiplayer_won || 0);

  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-center">{user.username || user.name || "Player"}'s Stats</h2>
      
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
        <CardHeader>
          <CardTitle>Game Mode Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Classic Mode:</span>
            <span>
              {stats.classic_won || 0}/{stats.classic_played || 0} (
              {stats.classic_played && stats.classic_played > 0
                ? Math.round(((stats.classic_won || 0) / stats.classic_played) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="flex justify-between">
            <span>Hard Mode:</span>
            <span>
              {stats.hard_won || 0}/{stats.hard_played || 0} (
              {stats.hard_played && stats.hard_played > 0
                ? Math.round(((stats.hard_won || 0) / stats.hard_played) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="flex justify-between">
            <span>Timed Mode:</span>
            <span>
              {stats.timed_won || 0}/{stats.timed_played || 0} (
              {stats.timed_played && stats.timed_played > 0
                ? Math.round(((stats.timed_won || 0) / stats.timed_played) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="flex justify-between">
            <span>Multiplayer:</span>
            <span>
              {stats.multiplayer_won || 0}/{stats.multiplayer_played || 0} (
              {stats.multiplayer_played && stats.multiplayer_played > 0
                ? Math.round(((stats.multiplayer_won || 0) / stats.multiplayer_played) * 100)
                : 0}
              %)
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Streaks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Current Streak:</span>
            <span className="font-bold">{stats.current_streak || 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Best Streak:</span>
            <span className="font-bold">{stats.best_streak || 0}</span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Total Green Letters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-center text-green-500">
            {stats.total_green_letters || 0}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
