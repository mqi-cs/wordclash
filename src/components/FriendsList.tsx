import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Swords, Trophy } from "lucide-react";
import { getRandomWord } from "@/lib/wordList";
import { toast } from "sonner";

interface Friend {
  id: string;
  username: string;
  stats: {
    classic_won: number;
    classic_played: number;
    current_streak: number;
    best_streak: number;
  } | null;
}

export const FriendsList = ({ onChallenge }: { onChallenge?: (friendId: string) => void }) => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sendingChallenge, setSendingChallenge] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchFriends();
  }, [user]);

  const fetchFriends = async () => {
    try {
      // Get friendships where user is either sender or receiver
      const { data: friendships, error } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${user?.id},friend_id.eq.${user?.id}`);

      if (error) throw error;

      // Get friend IDs
      const friendIds = friendships.map((f) =>
        f.user_id === user?.id ? f.friend_id : f.user_id
      );

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      // Get friend profiles and stats
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", friendIds);

      if (profileError) throw profileError;

      const { data: stats, error: statsError } = await supabase
        .from("user_stats")
        .select("user_id, classic_won, classic_played, current_streak, best_streak")
        .in("user_id", friendIds);

      if (statsError) throw statsError;

      // Combine profiles with stats
      const friendsData = profiles.map((profile) => ({
        id: profile.id,
        username: profile.username,
        stats: stats.find((s) => s.user_id === profile.id) || null,
      }));

      setFriends(friendsData);
    } catch (error) {
      // Error fetching friends - fail silently
    }
  };

  const handleChallenge = async (friendId: string) => {
    if (!user) return;

    setSendingChallenge(friendId);

    try {
      // Create a new multiplayer game
      const word = getRandomWord();
      const { data: game, error: gameError } = await supabase
        .from("multiplayer_games")
        .insert({
          player1_id: user.id,
          status: "waiting",
          game_type: "challenge"
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // Store target word in secrets table
      const { error: secretError } = await supabase
        .from("multiplayer_game_secrets")
        .insert({
          game_id: game.id,
          target_word: word
        });

      if (secretError) throw secretError;

      // Create a game invitation
      const { error: inviteError } = await supabase
        .from("game_invitations")
        .insert({
          game_id: game.id,
          from_user_id: user.id,
          to_user_id: friendId,
          status: "pending"
        });

      if (inviteError) throw inviteError;

      toast.success("Challenge sent!");

      // Call the optional onChallenge callback
      onChallenge?.(friendId);
    } catch (error: any) {
      console.error("Error sending challenge:", error);
      const errorMessage = error?.message || "Failed to send challenge";
      toast.error(errorMessage);
    } finally {
      setSendingChallenge(null);
    }
  };

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Friends ({friends.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {friends.map((friend) => (
          <div
            key={friend.id}
            className="p-4 bg-muted rounded-lg space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-lg">{friend.username}</span>
              <Button
                size="sm"
                onClick={() => handleChallenge(friend.id)}
                disabled={sendingChallenge === friend.id}
              >
                <Swords className="h-4 w-4 mr-2" />
                {sendingChallenge === friend.id ? "Sending..." : "Challenge"}
              </Button>
            </div>

            {friend.stats && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Win Rate: {friend.stats.classic_played > 0
                      ? Math.round((friend.stats.classic_won / friend.stats.classic_played) * 100)
                      : 0}%
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Streak: </span>
                  <span className="font-semibold">{friend.stats.current_streak}</span>
                  <span className="text-muted-foreground"> (Best: {friend.stats.best_streak})</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
