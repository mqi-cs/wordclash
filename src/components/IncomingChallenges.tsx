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
  const declineInvitation = useMutation(api.games.declineInvitation);

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

  const handleDecline = async (invitationId: string) => {
    setProcessingChallenge(invitationId);
    try {
      await declineInvitation({ invitationId: invitationId as any });
      toast.success("Challenge declined");
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Error declining challenge:", error);
      toast.error(error.message || "Failed to decline challenge");
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
              className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex items-center gap-3">
                <span className="truncate font-semibold">{challenge.senderUsername}</span>
                <span className="text-xs text-muted-foreground px-2 py-1 bg-secondary rounded-full">
                  Vs Challenge
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAccept(challenge._id)}
                  disabled={processingChallenge === challenge._id}
                  className="w-full bg-primary hover:bg-primary/90 sm:w-auto"
                >
                  <Check className="h-4 w-4 mr-1" />
                  {processingChallenge === challenge._id ? "Processing..." : "Accept & Play"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDecline(challenge._id)}
                  disabled={processingChallenge === challenge._id}
                  className="w-full sm:w-auto"
                >
                  <X className="h-4 w-4 mr-1" />
                  {processingChallenge === challenge._id ? "Processing..." : "Decline"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
