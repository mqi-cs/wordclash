import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

/**
 * Search for users by their username
 */
export const searchUsers = query({
  args: { searchQuery: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    if (!args.searchQuery || args.searchQuery.length < 3) return [];

    const queryLower = args.searchQuery.toLowerCase();
    
    // Simplistic search: getting all users and filtering.
    // In production, consider using Convex Search Index for fuzzy matching
    const allUsers = await ctx.db.query("users").collect();
    
    const matchedUsers = allUsers.filter(u => 
      u._id !== userId && // Don't return self
      u.name && u.name.toLowerCase().includes(queryLower)
    );

    // Get existing friendships to tell client if they're already friends or pending
    const friendshipsAsUser1 = await ctx.db
      .query("friendships")
      .withIndex("by_user1", (q) => q.eq("user1Id", userId))
      .collect();
      
    const friendshipsAsUser2 = await ctx.db
      .query("friendships")
      .withIndex("by_user2", (q) => q.eq("user2Id", userId))
      .collect();
      
    const allFriendships = [...friendshipsAsUser1, ...friendshipsAsUser2];

    return matchedUsers.map(user => {
      const friendship = allFriendships.find(f => f.user1Id === user._id || f.user2Id === user._id);
      
      return {
        id: user._id,
        username: user.name,
        friendship_status: friendship ? friendship.status : null,
        // If it's pending, who requested it?
        is_request_sender: friendship?.status === "pending" ? friendship.requesterId === userId : false
      };
    }).slice(0, 10); // Return top 10 matches
  },
});

export const getRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    // Pending requests where we are NOT the requester
    const asUser1 = await ctx.db
      .query("friendships")
      .withIndex("by_user1", (q) => q.eq("user1Id", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const asUser2 = await ctx.db
      .query("friendships")
      .withIndex("by_user2", (q) => q.eq("user2Id", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const incomingRequests = [...asUser1, ...asUser2].filter(f => f.requesterId !== userId);

    // Map to user objects
    return await Promise.all(incomingRequests.map(async (f) => {
      const senderId = f.requesterId;
      const sender = await ctx.db.get(senderId);
      return {
        friendshipId: f._id,
        senderId: senderId,
        senderUsername: sender?.name || "Unknown User",
      };
    }));
  },
});

export const getFriends = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const asUser1 = await ctx.db
      .query("friendships")
      .withIndex("by_user1", (q) => q.eq("user1Id", userId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    const asUser2 = await ctx.db
      .query("friendships")
      .withIndex("by_user2", (q) => q.eq("user2Id", userId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    const friendsList = [...asUser1, ...asUser2];

    return await Promise.all(friendsList.map(async (f) => {
      const friendId = f.user1Id === userId ? f.user2Id : f.user1Id;
      const friend = await ctx.db.get(friendId);
      const friendStats = await ctx.db
        .query("userStats")
        .withIndex("by_user", (q) => q.eq("userId", friendId))
        .unique();
        
      return {
        friendshipId: f._id,
        friendId: friendId,
        friendUsername: friend?.name || "Unknown User",
        stats: friendStats
      };
    }));
  },
});

export const sendRequest = mutation({
  args: { friendId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    if (userId === args.friendId) throw new Error("Cannot add yourself");

    // Check if friendship already exists
    const existing1 = await ctx.db
      .query("friendships")
      .withIndex("by_users", (q) => q.eq("user1Id", userId).eq("user2Id", args.friendId))
      .first();
      
    const existing2 = await ctx.db
      .query("friendships")
      .withIndex("by_users", (q) => q.eq("user1Id", args.friendId).eq("user2Id", userId))
      .first();

    if (existing1 || existing2) {
      throw new Error("Friendship or request already exists");
    }

    await ctx.db.insert("friendships", {
      user1Id: userId,
      user2Id: args.friendId,
      status: "pending",
      requesterId: userId,
    });
  },
});

export const acceptRequest = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) throw new Error("Request not found");
    
    // Ensure we are part of this friendship and NOT the requester
    if ((friendship.user1Id !== userId && friendship.user2Id !== userId) || friendship.requesterId === userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.friendshipId, { status: "accepted" });
  },
});

export const removeFriend = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) throw new Error("Friendship not found");
    
    if (friendship.user1Id !== userId && friendship.user2Id !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.friendshipId);
  },
});
