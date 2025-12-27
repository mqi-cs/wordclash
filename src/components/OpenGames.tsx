import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, X, Users, Clock, Crown } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface OpenGame {
  id: string;
  player1_id: string;
  player2_id: string | null;
  player3_id: string | null;
  player4_id: string | null;
  game_started: boolean;
  status: string;
  created_at: string;
  host_username: string;
  player_count: number;
  is_host: boolean;
}

interface OpenGamesProps {
  onResumeGame: (gameId: string) => void;
}

export const OpenGames = ({ onResumeGame }: OpenGamesProps) => {
  const { user } = useAuth();
  const [games, setGames] = useState<OpenGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingGame, setClosingGame] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchOpenGames();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("open-games")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "multiplayer_games",
        },
        () => {
          fetchOpenGames();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchOpenGames = async () => {
    if (!user) return;

    try {
      // Fetch games where user is a player and game is not finished
      // Only show challenge games (multiplayer quick-play games are not resumable)
      const { data: gamesData, error } = await supabase
        .from("multiplayer_games")
        .select("*")
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id},player3_id.eq.${user.id},player4_id.eq.${user.id}`)
        .eq("game_type", "challenge")
        .in("status", ["waiting", "in_progress"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!gamesData || gamesData.length === 0) {
        setGames([]);
        setLoading(false);
        return;
      }

      // Get host usernames
      const hostIds = [...new Set(gamesData.map(g => g.player1_id))];
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", hostIds);

      if (profileError) throw profileError;

      const openGames: OpenGame[] = gamesData.map(game => {
        const playerCount = [game.player1_id, game.player2_id, game.player3_id, game.player4_id]
          .filter(Boolean).length;

        return {
          ...game,
          host_username: profiles?.find(p => p.id === game.player1_id)?.username || "Unknown",
          player_count: playerCount,
          is_host: game.player1_id === user.id,
        };
      });

      setGames(openGames);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error fetching open games:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResume = (gameId: string) => {
    onResumeGame(gameId);
  };

  const handleClose = async (game: OpenGame) => {
    if (!user) return;

    setClosingGame(game.id);

    try {
      if (game.is_host && !game.game_started) {
        // Host can delete the game if it hasn't started
        const { error } = await supabase
          .from("multiplayer_games")
          .delete()
          .eq("id", game.id);

        if (error) throw error;
        toast.success("Game closed");
      } else {
        // Players can abandon the game
        const { error } = await supabase
          .from("multiplayer_games")
          .update({ status: "abandoned" })
          .eq("id", game.id);

        if (error) throw error;
        toast.success("Left the game");
      }

      fetchOpenGames();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error closing game:", error);
      }
      toast.error("Failed to close game");
    } finally {
      setClosingGame(null);
    }
  };

  if (loading) {
    return null;
  }

  if (games.length === 0) {
    return null;
  }

  return (
    <Card className="border-[hsl(var(--menu-multiplayer))]/20 bg-[hsl(var(--menu-multiplayer))]/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[hsl(var(--menu-multiplayer))]" />
          Open Games ({games.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {games.map((game) => (
          <div
            key={game.id}
            className="p-4 bg-background rounded-lg space-y-3 border border-[hsl(var(--menu-multiplayer))]/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {game.is_host && (
                  <Crown className="h-4 w-4 text-amber-500" />
                )}
                <span className="font-bold">
                  {game.is_host ? "Your Game" : `${game.host_username}'s Game`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{game.player_count}/4 players</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatDistanceToNow(new Date(game.created_at), { addSuffix: true })}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${game.game_started
                  ? "bg-[hsl(var(--menu-classic))]/20 text-[hsl(var(--menu-classic))]"
                  : "bg-amber-500/20 text-amber-600"
                }`}>
                {game.game_started ? "In Progress" : "Waiting"}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleResume(game.id)}
                className="bg-[hsl(var(--menu-multiplayer))] hover:bg-[hsl(var(--menu-multiplayer))]/90"
              >
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleClose(game)}
                disabled={closingGame === game.id}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4 mr-2" />
                {game.is_host && !game.game_started ? "Close" : "Leave"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
