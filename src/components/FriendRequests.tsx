import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, UserX } from "lucide-react";

interface FriendRequest {
  id: string;
  user_id: string;
  sender: {
    username: string;
  };
}

export const FriendRequests = ({ onUpdate }: { onUpdate?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<FriendRequest[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchRequests();
  }, [user]);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("friendships")
        .select("id, user_id")
        .eq("friend_id", user?.id)
        .eq("status", "pending");

      if (error) throw error;

      // Get sender profiles
      const senderIds = data?.map((r) => r.user_id) || [];
      if (senderIds.length === 0) {
        setRequests([]);
        return;
      }

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", senderIds);

      if (profileError) throw profileError;

      const requestsWithSenders = data?.map((request) => ({
        ...request,
        sender: profiles?.find((p) => p.id === request.user_id) || { username: "Unknown" },
      })) || [];

      setRequests(requestsWithSenders);
    } catch (error) {
      console.error("Error fetching friend requests:", error);
    }
  };

  const handleRequest = async (requestId: string, accept: boolean) => {
    try {
      if (accept) {
        const { error } = await supabase
          .from("friendships")
          .update({ status: "accepted" })
          .eq("id", requestId);

        if (error) throw error;

        toast({
          title: "Friend request accepted",
          description: "You are now friends!",
        });
      } else {
        const { error } = await supabase
          .from("friendships")
          .update({ status: "rejected" })
          .eq("id", requestId);

        if (error) throw error;

        toast({
          title: "Friend request rejected",
        });
      }

      fetchRequests();
      onUpdate?.();
    } catch (error) {
      console.error("Error handling friend request:", error);
      toast({
        title: "Error",
        description: "Failed to handle friend request",
        variant: "destructive",
      });
    }
  };

  if (requests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Friend Requests ({requests.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((request) => (
          <div
            key={request.id}
            className="flex items-center justify-between p-3 bg-muted rounded-lg"
          >
            <span className="font-medium">{request.sender.username}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleRequest(request.id, true)}
              >
                <UserCheck className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleRequest(request.id, false)}
              >
                <UserX className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
