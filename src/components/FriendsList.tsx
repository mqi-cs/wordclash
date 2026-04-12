import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Swords, Trophy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const FriendsList = ({ onChallenge }: { onChallenge?: (friendId: string) => void }) => {
  const { user } = useAuth();
  const friends = useQuery(api.friends.getFriends);
  
  const createGame = useMutation(api.games.createGame);
  const inviteToGame = useMutation(api.games.inviteToGame);

  const [sendingChallenge, setSendingChallenge] = useState<string | null>(null);
  const [challengeMode, setChallengeMode] = useState<"classic" | "hard" | "timed">("classic");

  if (!user || friends === undefined) {
    return (
      <Card className="border-border/70 bg-card/70">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Friends</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <p className="text-muted-foreground">Loading friends...</p>
        </CardContent>
      </Card>
    );
  }

  if (friends.length === 0) {
    return (
      <Card className="border-border/70 bg-card/70">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Friends</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <p className="text-muted-foreground">No friends yet. Search for users to add friends!</p>
        </CardContent>
      </Card>
    );
  }

  const handleChallenge = async (friendId: string) => {
    setSendingChallenge(friendId);

    try {
      const gameId = await createGame({ gameType: "challenge", mode: challengeMode });
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
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl">Friends</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="space-y-3 sm:space-y-4">
          {friends.map((friend) => (
            <div
              key={friend.friendshipId}
              className="flex min-w-0 flex-col gap-3 rounded-xl bg-muted/50 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4"
            >
              <div className="flex-1 min-w-0 w-full">
                <p className="truncate text-base font-semibold sm:text-lg">
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
              <div className="w-full shrink-0 sm:w-auto sm:min-w-[210px]">
                <div className="flex min-w-0 rounded-md bg-muted p-1">
                    {(["classic", "hard", "timed"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setChallengeMode(m)}
                            className={cn(
                                "min-w-0 flex-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all",
                                challengeMode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
                <Button
                    onClick={() => handleChallenge(friend.friendId)}
                    disabled={sendingChallenge === friend.friendId}
                    variant="secondary"
                    size="sm"
                    className="mt-2 h-9 w-full"
                >
                    <Swords className="h-4 w-4 mr-2" />
                    {sendingChallenge === friend.friendId
                    ? "Sending..."
                    : "Challenge"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
