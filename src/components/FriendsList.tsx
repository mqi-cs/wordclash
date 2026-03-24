import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Swords, Trophy } from "lucide-react";
import { toast } from "sonner";

export const FriendsList = ({ onChallenge }: { onChallenge?: (friendId: string) => void }) => {
  const { user } = useAuth();
  const friends = useQuery(api.friends.getFriends);
  
  const createGame = useMutation(api.games.createGame);
  const inviteToGame = useMutation(api.games.inviteToGame);

  const [sendingChallenge, setSendingChallenge] = useState<string | null>(null);

  if (!user || friends === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Friends</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading friends...</p>
        </CardContent>
      </Card>
    );
  }

  if (friends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Friends</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No friends yet. Search for users to add friends!</p>
        </CardContent>
      </Card>
    );
  }

  const handleChallenge = async (friendId: string) => {
    setSendingChallenge(friendId);

    try {
      const gameId = await createGame({ gameType: "challenge" });
      // Target word is now picked server-side automatically
      
      // We pass the friend's Convex ID. Since we mapped string `id` to `_id` in User type, we just cast it.
      await inviteToGame({ gameId, friendId: friendId as any });
      
      toast.success("Challenge sent!");
      onChallenge?.(friendId);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Error sending challenge:", error);
      toast.error(error.message || "Failed to send challenge");
    } finally {
      setSendingChallenge(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Friends</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {friends.map((friend) => (
            <div
              key={friend.friendshipId}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-muted/50 rounded-lg gap-4"
            >
              <div className="flex-1 min-w-0 w-full">
                <p className="font-semibold text-lg truncate">
                  {friend.friendUsername}
                </p>
                {friend.stats && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Trophy className="h-3 w-3" />
                      Win Rate:{" "}
                      {friend.stats.classic_played > 0
                        ? Math.round(
                            (friend.stats.classic_won /
                              friend.stats.classic_played) *
                              100
                          )
                        : 0}
                      %
                    </span>
                    <span className="whitespace-nowrap">
                      Best Streak: {friend.stats.best_streak}
                    </span>
                  </div>
                )}
              </div>
              <Button
                onClick={() => handleChallenge(friend.friendId)}
                disabled={sendingChallenge === friend.friendId}
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto shrink-0"
              >
                <Swords className="h-4 w-4 mr-2" />
                {sendingChallenge === friend.friendId
                  ? "Sending..."
                  : "Challenge"}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
