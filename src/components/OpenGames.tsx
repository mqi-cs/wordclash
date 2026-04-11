import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Play, Users, Clock, Crown, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useEffect, useState } from "react";

interface OpenGamesProps {
  onResumeGame: (gameId: string) => void;
}

import { usePostHog } from "@/contexts/PostHogContext";

export const OpenGames = ({ onResumeGame }: OpenGamesProps) => {
  const { user } = useAuth();
  const { trackGame } = usePostHog();
  const games = useQuery(api.games.getMyGames);
  const cleanupStaleWaitingGames = useMutation(api.games.cleanupStaleWaitingGames);
  const deleteGame = useMutation(api.games.deleteGame);
  const [deletingGameId, setDeletingGameId] = useState<Id<"games"> | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    void cleanupStaleWaitingGames({}).catch(() => null);
  }, [cleanupStaleWaitingGames, user]);

  const handleDeleteGame = async (gameId: Id<"games">) => {
    setDeletingGameId(gameId);
    try {
      const g = games?.find(x => x._id === gameId);
      await deleteGame({ gameId });
      trackGame("game_deleted", { 
        game_id: gameId, 
        game_type: g?.gameType, 
        mode: g?.mode 
      });
      toast.success("Game removed");
    } catch (error: any) {
// ... existing code continues
      toast.error(error.message || "Failed to delete game");
    } finally {
      setDeletingGameId(null);
    }
  };

  const handleResume = (gameId: Id<"games">) => {
    const g = games?.find(x => x._id === gameId);
    trackGame("game_resumed", { 
      game_id: gameId, 
      game_type: g?.gameType, 
      mode: g?.mode,
      status: g?.status
    });
    onResumeGame(gameId);
  };

  if (!user || games === undefined) {
    return (
      <Card className="border-border/70 bg-card/70">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Your Active Games</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (games.length === 0) {
    return (
      <Card className="border-border/70 bg-card/70">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Your Active Games</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-muted-foreground sm:p-8">
            <Clock className="mx-auto mb-3 h-10 w-10 opacity-20 sm:h-12 sm:w-12" />
            <p>No active games right now.</p>
            <p className="text-sm mt-1">Start a new match or challenge a friend to get playing!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl">Your Active Games</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="grid gap-3 md:grid-cols-2 sm:gap-4">
          {games.map((game) => (
            <Card key={game._id} className="overflow-hidden rounded-[1.4rem] border-primary/10 bg-muted/30">
              <div className="h-1 w-full bg-primary/20" />
              <CardContent className="p-3.5 sm:p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {game.gameType === "challenge" ? (
                          <Crown className="h-4 w-4 text-primary" />
                        ) : (
                          <Users className="h-4 w-4 text-primary" />
                        )}
                        <h3 className="text-base font-semibold capitalize sm:text-lg">{game.gameType} Match</h3>
                        {game.mode && (
                          <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold uppercase tracking-wider">
                            {game.mode}
                          </span>
                        )}
                      </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {game.startedAt
                        ? `Started ${formatDistanceToNow(new Date(game.startedAt), { addSuffix: true })}`
                        : "Waiting for opponent..."}
                    </div>
                    {game.gameType === "multiplayer" && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {game.playerCount}/4 players
                        {game.lobbyCode ? ` • Code ${game.lobbyCode}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="w-fit rounded bg-secondary px-2 py-1 text-xs font-medium capitalize">
                    {game.status.replace("_", " ")}
                  </div>
                </div>

                <Button 
                  onClick={() => handleResume(game._id)}
                  className="mt-2 h-10 w-full"
                  variant={game.status === "in_progress" ? "default" : "secondary"}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {game.status === "waiting" && game.player1Id === user.id 
                    ? "Waiting Room" 
                    : "Resume Game"}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 h-10 w-full text-destructive hover:text-destructive"
                      disabled={deletingGameId === game._id}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deletingGameId === game._id ? "Deleting..." : "Delete"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this game?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove this {game.gameType} match for every player involved,
                        including all guesses and lobby state.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void handleDeleteGame(game._id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
