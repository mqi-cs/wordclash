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
      <Card>
        <CardHeader>
          <CardTitle>Your Active Games</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (games.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Active Games</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-8 text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No active games right now.</p>
            <p className="text-sm mt-1">Start a new match or challenge a friend to get playing!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Active Games</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {games.map((game) => (
            <Card key={game._id} className="bg-muted/30 border-primary/10 overflow-hidden">
              <div className="h-1 w-full bg-primary/20" />
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                      <div className="flex items-center gap-2 mb-1">
                        {game.gameType === "challenge" ? (
                          <Crown className="h-4 w-4 text-primary" />
                        ) : (
                          <Users className="h-4 w-4 text-primary" />
                        )}
                        <h3 className="font-semibold text-lg capitalize">{game.gameType} Match</h3>
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
                  <div className="px-2 py-1 bg-secondary rounded text-xs font-medium capitalize">
                    {game.status.replace("_", " ")}
                  </div>
                </div>

                <Button 
                  onClick={() => handleResume(game._id)}
                  className="w-full mt-2"
                  variant={game.status === "in_progress" ? "default" : "secondary"}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {game.status === "waiting" && game.player1Id === user.id 
                    ? "Waiting Room" 
                    : "Resume Game"}
                </Button>

                {game.canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full mt-2 text-destructive hover:text-destructive"
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
                          {game.gameType === "challenge"
                            ? "This will cancel the waiting challenge and remove it from your active games."
                            : "This will close the waiting lobby and remove it from your active games."}
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
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
