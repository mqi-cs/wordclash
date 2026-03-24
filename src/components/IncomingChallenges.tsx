import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Swords, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export const IncomingChallenges = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const challenges = useQuery(api.games.getIncomingInvitations);
  const acceptInvitation = useMutation(api.games.acceptInvitation);

  const [processingChallenge, setProcessingChallenge] = useState<string | null>(null);

  if (!user || challenges === undefined) return null;
  if (challenges.length === 0) return null;

  const handleAccept = async (invitationId: string) => {
    setProcessingChallenge(invitationId);
    try {
      const gameId = await acceptInvitation({ invitationId: invitationId as any });
      toast.success("Challenge accepted!");
      navigate(`/?join=${gameId}&mode=multiplayer`);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Error accepting challenge:", error);
      toast.error(error.message || "Failed to accept challenge");
    } finally {
      setProcessingChallenge(null);
    }
  };

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <Swords className="h-5 w-5 mr-2 text-primary" />
          Incoming Challenges
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {challenges.map((challenge) => (
            <div
              key={challenge._id}
              className="flex items-center justify-between p-3 bg-background rounded-md shadow-sm border border-border"
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold">{challenge.senderUsername}</span>
                <span className="text-xs text-muted-foreground px-2 py-1 bg-secondary rounded-full">
                  Vs Challenge
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAccept(challenge._id)}
                  disabled={processingChallenge === challenge._id}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Check className="h-4 w-4 mr-1" />
                  {processingChallenge === challenge._id ? "Processing..." : "Accept & Play"}
                </Button>
                {/* Convex doesn't have a decline invite function yet, so we could add one if needed. Or just leave it open. */}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
