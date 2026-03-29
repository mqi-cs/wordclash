import { auth } from "./auth";
import { assertValidUsername } from "./authShared";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { assignUsernameToUser, USERNAME_TAKEN_ERROR } from "./usernames";
import { v } from "convex/values";

const clampAuditLimit = (requestedLimit: number | undefined) => {
  const limit = Math.floor(requestedLimit ?? 500);
  return Math.min(Math.max(limit, 1), 1000);
};

const capAuditFindings = <T>(items: T[], maxItems: number = 50) => items.slice(0, maxItems);

/**
 * Returns the currently authenticated user — only safe fields
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (userId === null) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) return null;

    // Return only the fields the client actually needs
    return {
      _id: user._id,
      name: user.username ?? user.name ?? user.googleName,
      username: user.username,
      googleName: user.googleName,
      email: user.email,
    };
  },
});

export const completeProfile = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (userId === null) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const username = assertValidUsername(args.username);
    await assignUsernameToUser(ctx.db, userId, username, user.username);
    await ctx.db.patch(userId, { username });

    return { success: true };
  },
});

export const auditUsernameIntegrity = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = clampAuditLimit(args.limit);
    const users = await ctx.db.query("users").take(limit);
    const claims = await ctx.db.query("usernameClaims").take(limit);

    const usersById = new Map(users.map((user) => [user._id, user]));
    const claimsByUsername = new Map(claims.map((claim) => [claim.username, claim]));

    const exactUsernameMap = new Map<string, string[]>();
    const caseInsensitiveUsernameMap = new Map<string, Set<string>>();

    for (const user of users) {
      if (!user.username) {
        continue;
      }

      const exactMatches = exactUsernameMap.get(user.username) ?? [];
      exactMatches.push(user._id);
      exactUsernameMap.set(user.username, exactMatches);

      const normalizedUsername = user.username.toLowerCase();
      const variants = caseInsensitiveUsernameMap.get(normalizedUsername) ?? new Set<string>();
      variants.add(user.username);
      caseInsensitiveUsernameMap.set(normalizedUsername, variants);
    }

    const exactDuplicates = capAuditFindings(
      Array.from(exactUsernameMap.entries())
        .filter(([, userIds]) => userIds.length > 1)
        .map(([username, userIds]) => ({ username, userIds })),
    );

    const caseInsensitiveCollisions = capAuditFindings(
      Array.from(caseInsensitiveUsernameMap.entries())
        .filter(([, variants]) => variants.size > 1)
        .map(([normalizedUsername, variants]) => ({
          normalizedUsername,
          usernames: Array.from(variants).sort(),
        })),
    );

    const usersMissingClaims = capAuditFindings(
      users
        .filter((user) => user.username && !claimsByUsername.has(user.username))
        .map((user) => ({
          userId: user._id,
          username: user.username!,
        })),
    );

    const claimsWithoutUsers = capAuditFindings(
      claims
        .filter((claim) => claim.userId && !usersById.has(claim.userId))
        .map((claim) => ({
          claimId: claim._id,
          username: claim.username,
          userId: claim.userId!,
        })),
    );

    const claimsPointingAtDifferentUsername = capAuditFindings(
      claims
        .filter((claim) => {
          if (!claim.userId) {
            return false;
          }
          const user = usersById.get(claim.userId);
          return user !== undefined && user.username !== claim.username;
        })
        .map((claim) => ({
          claimId: claim._id,
          username: claim.username,
          userId: claim.userId!,
          actualUsername: usersById.get(claim.userId!)?.username ?? null,
        })),
    );

    const unattachedClaims = capAuditFindings(
      claims
        .filter((claim) => claim.userId === undefined)
        .map((claim) => ({
          claimId: claim._id,
          username: claim.username,
        })),
    );

    return {
      limitApplied: limit,
      scannedUsers: users.length,
      scannedClaims: claims.length,
      usersMayBeTruncated: users.length === limit,
      claimsMayBeTruncated: claims.length === limit,
      exactDuplicates,
      caseInsensitiveCollisions,
      usersMissingClaims,
      claimsWithoutUsers,
      claimsPointingAtDifferentUsername,
      unattachedClaims,
    };
  },
});

export const repairUsernameIntegrity = internalMutation({
  args: {
    limit: v.optional(v.number()),
    pruneUnattachedClaims: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = clampAuditLimit(args.limit);
    const pruneUnattachedClaims = args.pruneUnattachedClaims ?? false;
    const users = await ctx.db.query("users").take(limit);
    const claims = await ctx.db.query("usernameClaims").take(limit);

    const usersById = new Map(users.map((user) => [user._id, user]));
    const claimsByUsername = new Map(claims.map((claim) => [claim.username, claim]));
    const exactUsernameMap = new Map<string, string[]>();

    for (const user of users) {
      if (!user.username) {
        continue;
      }

      const matches = exactUsernameMap.get(user.username) ?? [];
      matches.push(user._id);
      exactUsernameMap.set(user.username, matches);
    }

    const duplicateUsernames = new Set(
      Array.from(exactUsernameMap.entries())
        .filter(([, userIds]) => userIds.length > 1)
        .map(([username]) => username),
    );

    let deletedClaimsWithoutUsers = 0;
    let deletedMismatchedClaims = 0;
    let deletedUnattachedClaims = 0;
    let insertedMissingClaims = 0;
    let patchedClaimsToCorrectUsers = 0;
    let skippedDuplicateUsernames = 0;

    for (const claim of claims) {
      if (claim.userId && !usersById.has(claim.userId)) {
        await ctx.db.delete(claim._id);
        deletedClaimsWithoutUsers += 1;
        claimsByUsername.delete(claim.username);
        continue;
      }

      if (!claim.userId) {
        if (pruneUnattachedClaims) {
          await ctx.db.delete(claim._id);
          deletedUnattachedClaims += 1;
          claimsByUsername.delete(claim.username);
        }
        continue;
      }

      const user = usersById.get(claim.userId);
      if (!user || user.username !== claim.username) {
        await ctx.db.delete(claim._id);
        deletedMismatchedClaims += 1;
        claimsByUsername.delete(claim.username);
      }
    }

    for (const user of users) {
      if (!user.username) {
        continue;
      }

      if (duplicateUsernames.has(user.username)) {
        skippedDuplicateUsernames += 1;
        continue;
      }

      const existingClaim = claimsByUsername.get(user.username);
      if (!existingClaim) {
        const claimId = await ctx.db.insert("usernameClaims", {
          username: user.username,
          userId: user._id,
        });
        insertedMissingClaims += 1;
        claimsByUsername.set(user.username, {
          _id: claimId,
          _creationTime: Date.now(),
          username: user.username,
          userId: user._id,
        });
        continue;
      }

      if (existingClaim.userId !== user._id) {
        await ctx.db.patch(existingClaim._id, { userId: user._id });
        patchedClaimsToCorrectUsers += 1;
      }
    }

    return {
      limitApplied: limit,
      scannedUsers: users.length,
      scannedClaims: claims.length,
      pruneUnattachedClaims,
      deletedClaimsWithoutUsers,
      deletedMismatchedClaims,
      deletedUnattachedClaims,
      insertedMissingClaims,
      patchedClaimsToCorrectUsers,
      skippedDuplicateUsernames,
    };
  },
});

export const migrateLegacyNamesToUsername = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(200);
    let migratedToUsername = 0;
    let migratedToGoogleName = 0;
    let usernameClaimsEnsured = 0;
    let skippedInvalidUsername = 0;
    let skippedDuplicateUsername = 0;

    for (const user of users) {
      const googleAccount = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id).eq("provider", "google"))
        .unique();

      if (user.username) {
        try {
          await assignUsernameToUser(ctx.db, user._id, user.username, user.username);
          usernameClaimsEnsured += 1;
        } catch (error) {
          if (!(error instanceof Error) || error.message !== USERNAME_TAKEN_ERROR) {
            throw error;
          }
          skippedDuplicateUsername += 1;
        }
      } else if (!googleAccount && user.name) {
        try {
          const username = assertValidUsername(user.name);
          await assignUsernameToUser(ctx.db, user._id, username);
          await ctx.db.patch(user._id, { username });
          migratedToUsername += 1;
          usernameClaimsEnsured += 1;
        } catch (error) {
          if (error instanceof Error && error.message === USERNAME_TAKEN_ERROR) {
            skippedDuplicateUsername += 1;
            continue;
          }
          if (error instanceof Error && error.message !== USERNAME_TAKEN_ERROR) {
            skippedInvalidUsername += 1;
            continue;
          }
          throw error;
        }
      } else if (googleAccount && !user.googleName && user.name) {
        await ctx.db.patch(user._id, { googleName: user.name });
        migratedToGoogleName += 1;
      }
    }

    return {
      scanned: users.length,
      migratedToUsername,
      migratedToGoogleName,
      usernameClaimsEnsured,
      skippedDuplicateUsername,
      skippedInvalidUsername,
    };
  },
});
