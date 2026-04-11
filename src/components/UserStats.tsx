import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const UserStats = () => {
  const { user } = useAuth();
  
  // Fetch stats directly from Convex. Null means not loaded, undefined means no stats yet.
  const stats = useQuery(api.stats.getMyStats);
  const playerName = user?.username || user?.name || user?.googleName || "Player";

  if (!user) {
    return <div className="rounded-[1.5rem] border border-border/70 bg-card/60 p-4 text-center text-muted-foreground">Loading stats...</div>;
  }

  if (stats === undefined) {
    return <div className="rounded-[1.5rem] border border-border/70 bg-card/60 p-4 text-center text-muted-foreground">Loading stats...</div>;
  }

  const modes = [
    {
      label: "Classic",
      accent: "bg-[hsl(var(--menu-classic))]",
      won: stats?.classic_won || 0,
      played: stats?.classic_played || 0,
    },
    {
      label: "Hard",
      accent: "bg-[hsl(var(--menu-hard))]",
      won: stats?.hard_won || 0,
      played: stats?.hard_played || 0,
    },
    {
      label: "Timed",
      accent: "bg-[hsl(var(--menu-timed))]",
      won: stats?.timed_won || 0,
      played: stats?.timed_played || 0,
    },
    {
      label: "Multiplayer",
      accent: "bg-[hsl(var(--menu-multiplayer))]",
      won: stats?.multiplayer_won || 0,
      played: stats?.multiplayer_played || 0,
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/70">
        <CardHeader className="space-y-2 p-4 sm:p-6">
          <CardTitle className="text-xl tracking-tight sm:text-2xl">{playerName}'s Stats</CardTitle>
          <p className="text-sm text-muted-foreground">
            {stats === null
              ? "No stats yet, but your profile is ready for the first win."
              : "Your win rates across every WordClash queue."}
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 px-4 pb-4 sm:gap-4 sm:px-6 sm:pb-6 lg:grid-cols-4">
          {modes.map((mode) => {
            const percentage = mode.played > 0 ? Math.round((mode.won / mode.played) * 100) : 0;

            return (
              <div key={mode.label} className="rounded-[1.1rem] border border-border/70 bg-background/55 p-3 sm:rounded-[1.35rem] sm:p-4">
                <div className="mb-3 flex items-center justify-between sm:mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${mode.accent}`} />
                    <span className="text-sm font-semibold sm:text-base">{mode.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground sm:text-sm">{mode.won}/{mode.played}</span>
                </div>
                <div className="mb-3 flex items-end justify-between gap-2">
                  <span className="text-2xl font-black tracking-tight sm:text-3xl">{percentage}%</span>
                  <span className="text-[11px] text-muted-foreground sm:text-sm">win rate</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${mode.accent}`} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};
