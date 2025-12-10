import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Swords, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Challenge {
  id: string;
  game_id: string;
  from_user_id: string;
  from_username: string;
  created_at: string;
}

export const IncomingChallenges = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [processingChallenge, setProcessingChallenge] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchChallenges();

    // Subscribe to realtime updates for new challenges
    const channel = supabase
      .channel("game-invitations")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_invitations",
          filter: `to_user_id=eq.${user.id}`
        },
        () => {
          fetchChallenges();
          toast.info("You have a new challenge!");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchChallenges = async () => {
    if (!user) return;

    try {
      const { data: invitations, error } = await supabase
        .from("game_invitations")
        .select("id, game_id, from_user_id, created_at")
        .eq("to_user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch usernames for the challengers
      const userIds = invitations.map(inv => inv.from_user_id);
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

      if (profileError) throw profileError;

      const challengesData = invitations.map(inv => ({
        ...inv,
        from_username: profiles.find(p => p.id === inv.from_user_id)?.username || "Unknown"
      }));

      setChallenges(challengesData);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error fetching challenges:", error);
      }
    }
  };

  const handleAccept = async (challenge: Challenge) => {
    if (!user) return;
    
    setProcessingChallenge(challenge.id);
    
    try {
      // Use secure function to join game
      const { data, error: joinError } = await supabase.rpc('join_multiplayer_game', {
        game_id_param: challenge.game_id
      });

      if (joinError) throw joinError;

      // Update invitation status
      const { error: inviteError } = await supabase
        .from("game_invitations")
        .update({ status: "accepted" })
        .eq("id", challenge.id);

      if (inviteError) throw inviteError;

      toast.success("Challenge accepted!");
      
      // Navigate to the game (reload to ensure multiplayer mode is triggered)
      window.location.href = `${window.location.origin}/?join=${challenge.game_id}`;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error accepting challenge:", error);
      }
      toast.error("Failed to accept challenge");
    } finally {
      setProcessingChallenge(null);
    }
  };

  const handleDecline = async (challengeId: string) => {
    setProcessingChallenge(challengeId);
    
    try {
      const { error } = await supabase
        .from("game_invitations")
        .update({ status: "declined" })
        .eq("id", challengeId);

      if (error) throw error;

      toast.success("Challenge declined");
      fetchChallenges();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error declining challenge:", error);
      }
      toast.error("Failed to decline challenge");
    } finally {
      setProcessingChallenge(null);
    }
  };

  if (challenges.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-primary" />
          Incoming Challenges ({challenges.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {challenges.map((challenge) => (
          <div
            key={challenge.id}
            className="p-4 bg-background rounded-lg space-y-2 border border-primary/20"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{challenge.from_username}</p>
                <p className="text-sm text-muted-foreground">
                  Challenged you to a game!
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleAccept(challenge)}
                disabled={processingChallenge === challenge.id}
              >
                <Check className="h-4 w-4 mr-2" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDecline(challenge.id)}
                disabled={processingChallenge === challenge.id}
              >
                <X className="h-4 w-4 mr-2" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
