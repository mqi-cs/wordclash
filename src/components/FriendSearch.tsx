import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus } from "lucide-react";

export const FriendSearch = ({ onRequestSent }: { onRequestSent?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  // Only query when length is >= 3
  const searchResults = useQuery(
    api.friends.searchUsers,
    searchQuery.trim().length >= 3 ? { searchQuery: searchQuery.trim() } : "skip"
  );

  const sendRequest = useMutation(api.friends.sendRequest);

  const [sendingId, setSendingId] = useState<string | null>(null);

  const sendFriendRequest = async (friendId: string) => {
    setSendingId(friendId);
    try {
      await sendRequest({ friendId: friendId as any });
      toast({
        title: "Request sent",
        description: "Friend request sent successfully!",
      });
      onRequestSent?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send request",
        variant: "destructive",
      });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // With Convex it searches automatically on typing, but we keep this for UX feel
                e.preventDefault();
              }
            }}
          />
          <Button disabled={searchQuery.length < 3} variant="secondary">
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {searchResults && searchResults.length > 0 && (
          <div className="space-y-2">
            {searchResults.map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between p-3 bg-muted rounded-md"
              >
                <span className="font-semibold">{result.username}</span>
                <Button
                  onClick={() => sendFriendRequest(result.id)}
                  disabled={
                    sendingId === result.id ||
                    result.friendship_status !== null
                  }
                  size="sm"
                  variant={result.friendship_status ? "outline" : "default"}
                >
                  {sendingId === result.id ? (
                    "Sending..."
                  ) : result.friendship_status === "accepted" ? (
                    "Friends"
                  ) : result.friendship_status === "pending" ? (
                    result.is_request_sender ? "Request Sent" : "Pending Request"
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
        
        {searchQuery.length >= 3 && searchResults && searchResults.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No users found
          </p>
        )}
      </CardContent>
    </Card>
  );
};
