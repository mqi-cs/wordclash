import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const FriendRequests = ({ onRequestHandled }: { onRequestHandled?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const requests = useQuery(api.friends.getRequests);
  const acceptRequest = useMutation(api.friends.acceptRequest);
  const declineRequest = useMutation(api.friends.removeFriend);

  if (!user || requests === undefined) return null;
  if (requests.length === 0) return null;

  const handleAccept = async (friendshipId: string) => {
    try {
      await acceptRequest({ friendshipId: friendshipId as any });
      toast({ title: "Friend request accepted!" });
      onRequestHandled?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to accept request",
        variant: "destructive",
      });
    }
  };

  const handleDecline = async (friendshipId: string) => {
    try {
      await declineRequest({ friendshipId: friendshipId as any });
      toast({ title: "Friend request declined" });
      onRequestHandled?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to decline request",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Friend Requests</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.friendshipId}
              className="flex flex-col gap-3 rounded-md bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0 truncate font-semibold">{request.senderUsername}</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAccept(request.friendshipId)}
                  className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecline(request.friendshipId)}
                  className="w-full sm:w-auto"
                >
                  <X className="h-4 w-4 mr-1" />
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
