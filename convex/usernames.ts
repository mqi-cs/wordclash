import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { DatabaseWriter, internalMutation } from "./_generated/server";
import { assertValidUsername } from "./authShared";

export const USERNAME_TAKEN_ERROR = "Username is already taken";
const USERNAME_REGISTRY_ERROR = "Username registry is inconsistent";

const getUsernameClaims = async (db: DatabaseWriter, username: string) => {
  return await db
    .query("usernameClaims")
    .withIndex("by_username", (q) => q.eq("username", username))
    .take(2);
};

const getUsersWithUsername = async (db: DatabaseWriter, username: string) => {
  return await db
    .query("users")
    .withIndex("by_username", (q) => q.eq("username", username))
    .take(2);
};

const getSingleClaim = async (db: DatabaseWriter, username: string) => {
  const claims = await getUsernameClaims(db, username);
  if (claims.length > 1) {
    throw new Error(USERNAME_REGISTRY_ERROR);
  }
  return claims[0] ?? null;
};

const assertUsernameAvailable = async (
  db: DatabaseWriter,
  username: string,
  currentUserId?: Id<"users">,
) => {
  const claim = await getSingleClaim(db, username);
  if (claim && claim.userId !== undefined && claim.userId !== currentUserId) {
    throw new Error(USERNAME_TAKEN_ERROR);
  }

  const users = await getUsersWithUsername(db, username);
  if (users.some((user) => user._id !== currentUserId)) {
    throw new Error(USERNAME_TAKEN_ERROR);
  }

  return claim;
};

export const reserveUsername = async (
  db: DatabaseWriter,
  username: string,
  userId?: Id<"users">,
) => {
  const existingClaim = await assertUsernameAvailable(db, username, userId);
  if (!existingClaim) {
    await db.insert("usernameClaims", userId ? { username, userId } : { username });
    return;
  }

  if (userId && existingClaim.userId !== userId) {
    await db.patch(existingClaim._id, { userId });
  }
};

const deleteClaimIfOwned = async (
  db: DatabaseWriter,
  username: string,
  userId: Id<"users">,
) => {
  const claim = await getSingleClaim(db, username);
  if (claim?.userId === userId) {
    await db.delete(claim._id);
  }
};

export const reserveUsernameForSignup = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const username = assertValidUsername(args.username);
    await reserveUsername(ctx.db, username);
    return { username };
  },
});

export const attachUsernameToUser = internalMutation({
  args: { username: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const username = assertValidUsername(args.username);
    await reserveUsername(ctx.db, username, args.userId);
    return null;
  },
});

export const releaseSignupUsernameReservation = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const username = assertValidUsername(args.username);
    const claim = await getSingleClaim(ctx.db, username);
    if (claim && claim.userId === undefined) {
      await ctx.db.delete(claim._id);
    }
    return null;
  },
});

export const assignUsernameToUser = async (
  db: DatabaseWriter,
  userId: Id<"users">,
  requestedUsername: string,
  currentUsername?: string,
) => {
  const username = assertValidUsername(requestedUsername);
  await reserveUsername(db, username, userId);

  if (currentUsername && currentUsername !== username) {
    await deleteClaimIfOwned(db, currentUsername, userId);
  }

  return username;
};
