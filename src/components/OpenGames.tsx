import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Users, Clock, Crown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Id } from "../../convex/_generated/dataModel";

interface OpenGamesProps {
  onResumeGame: (gameId: string) => void;
}

export const OpenGames = ({ onResumeGame }: OpenGamesProps) => {
  const { user } = useAuth();
  const games = useQuery(api.games.getMyGames);

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
                  onClick={() => onResumeGame(game._id)}
                  className="w-full mt-2"
                  variant={game.status === "in_progress" ? "default" : "secondary"}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {game.status === "waiting" && game.player1Id === user.id 
                    ? "Waiting Room" 
                    : "Resume Game"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
