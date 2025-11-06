import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus } from "lucide-react";

interface SearchResult {
  id: string;
  username: string;
}

export const FriendSearch = ({ onRequestSent }: { onRequestSent?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username")
        .ilike("username", `%${searchQuery}%`)
        .neq("id", user?.id)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (friendId: string) => {
    try {
      // Check if request already exists
      const { data: existing } = await supabase
        .from("friendships")
        .select("*")
        .or(`and(user_id.eq.${user?.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user?.id})`)
        .single();

      if (existing) {
        toast({
          title: "Already friends",
          description: "You already have a connection with this user",
        });
        return;
      }

      const { error } = await supabase
        .from("friendships")
        .insert({
          user_id: user?.id,
          friend_id: friendId,
          status: "pending",
        });

      if (error) throw error;

      toast({
        title: "Friend request sent",
        description: "Your friend request has been sent successfully",
      });
      
      setSearchResults([]);
      setSearchQuery("");
      onRequestSent?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send friend request",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search users by username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchUsers()}
        />
        <Button onClick={searchUsers} disabled={loading}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {searchResults.length > 0 && (
        <div className="space-y-2">
          {searchResults.map((result) => (
            <Card key={result.id}>
              <CardContent className="flex items-center justify-between p-4">
                <span className="font-medium">{result.username}</span>
                <Button
                  size="sm"
                  onClick={() => sendFriendRequest(result.id)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Friend
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
