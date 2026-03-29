import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const UserStats = () => {
  const { user } = useAuth();
  
  // Fetch stats directly from Convex. Null means not loaded, undefined means no stats yet.
  const stats = useQuery(api.stats.getMyStats);

  if (!user || stats === undefined) return <div className="p-4 text-center">Loading stats...</div>;
  if (stats === null) return <div className="p-4 text-center">Play a game to see your stats!</div>;

  return (
    <div className="space-y-4">
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
    </div>
  );
};
