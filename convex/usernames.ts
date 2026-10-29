import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { DatabaseWriter, internalMutation } from "./_generated/server";
import { assertValidUsername } from "./authShared";
import { internal } from "./_generated/api";

export const USERNAME_TAKEN_ERROR = "Username is already taken";
const USERNAME_REGISTRY_ERROR = "Username registry is inconsistent";
// An unattached claim is a signup that is still being created. It holds the
// username for this long; after that it is treated as abandoned.
const PENDING_SIGNUP_CLAIM_TTL_MS = 10 * 60 * 1000;

type UsernameClaim = Doc<"usernameClaims">;

const isPendingSignupClaim = (claim: UsernameClaim, now = Date.now()) =>
  claim.userId === undefined && now - claim._creationTime < PENDING_SIGNUP_CLAIM_TTL_MS;

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
    throw new ConvexError(USERNAME_REGISTRY_ERROR);
  }
  return claims[0] ?? null;
};

const assertUsernameAvailable = async (
  db: DatabaseWriter,
  username: string,
  currentUserId?: Id<"users">,
  allowPendingSignupClaim = false,
) => {
  const claim = await getSingleClaim(db, username);
  if (claim && claim.userId !== undefined && claim.userId !== currentUserId) {
    throw new ConvexError(USERNAME_TAKEN_ERROR);
  }
  // Without this, two signups racing for the same name would both pass and
  // end up with duplicate usernames.
  if (claim && !allowPendingSignupClaim && isPendingSignupClaim(claim)) {
    throw new ConvexError(USERNAME_TAKEN_ERROR);
  }

  // Names are unique regardless of case, so "Alice" also blocks "alice".
  const sameNameClaims = await db
    .query("usernameClaims")
    .withIndex("by_username_lower", (q) => q.eq("usernameLower", username.toLowerCase()))
    .take(10);
  for (const other of sameNameClaims) {
    if (other.username === username) {
      continue; // The exact claim, checked above.
    }
    const ownedBySomeoneElse = other.userId !== undefined && other.userId !== currentUserId;
    if (ownedBySomeoneElse || isPendingSignupClaim(other)) {
      throw new ConvexError(USERNAME_TAKEN_ERROR);
    }
  }

  const users = await getUsersWithUsername(db, username);
  if (users.some((user) => user._id !== currentUserId)) {
    throw new ConvexError(USERNAME_TAKEN_ERROR);
  }

  return claim;
};

export const reserveUsername = async (
  db: DatabaseWriter,
  username: string,
  userId?: Id<"users">,
  allowPendingSignupClaim = false,
) => {
  const existingClaim = await assertUsernameAvailable(
    db,
    username,
    userId,
    allowPendingSignupClaim,
  );
  const usernameLower = username.toLowerCase();
  if (!existingClaim) {
    await db.insert("usernameClaims", { username, usernameLower, ...(userId ? { userId } : {}) });
    return;
  }

  if (!userId) {
    // Only an abandoned signup claim can reach here; replace it so the new
    // reservation gets a fresh TTL.
    if (existingClaim.userId === undefined) {
      await db.delete(existingClaim._id);
      await db.insert("usernameClaims", { username, usernameLower });
    }
    return;
  }

  if (existingClaim.userId !== userId || existingClaim.usernameLower !== usernameLower) {
    await db.patch(existingClaim._id, { userId, usernameLower });
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
    // Called by the signup flow right after it reserved this name itself.
    await reserveUsername(ctx.db, username, args.userId, true);
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

const MAINTENANCE_BATCH_SIZE = 200;

// Runs from crons.ts. Backfills the case-insensitive key on claims made
// before it existed, and deletes signup reservations that were abandoned.
// Both lookups are indexed, so a run with nothing to do reads almost nothing.
export const maintainUsernameRegistry = internalMutation({
  args: {},
  handler: async (ctx) => {
    const unkeyedClaims = await ctx.db
      .query("usernameClaims")
      .withIndex("by_username_lower", (q) => q.eq("usernameLower", undefined))
      .take(MAINTENANCE_BATCH_SIZE);
    for (const claim of unkeyedClaims) {
      await ctx.db.patch(claim._id, { usernameLower: claim.username.toLowerCase() });
    }

    const now = Date.now();
    const unattachedClaims = await ctx.db
      .query("usernameClaims")
      .withIndex("by_user", (q) => q.eq("userId", undefined))
      .take(MAINTENANCE_BATCH_SIZE);
    const abandonedClaims = unattachedClaims.filter((claim) => !isPendingSignupClaim(claim, now));
    for (const claim of abandonedClaims) {
      await ctx.db.delete(claim._id);
    }

    if (
      unkeyedClaims.length === MAINTENANCE_BATCH_SIZE ||
      abandonedClaims.length === MAINTENANCE_BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(0, internal.usernames.maintainUsernameRegistry, {});
    }

    return { backfilled: unkeyedClaims.length, deletedAbandoned: abandonedClaims.length };
  },
});
