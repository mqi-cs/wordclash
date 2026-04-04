import { createAccount } from "@convex-dev/auth/server";
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { assertValidEmail, assertValidPassword, assertValidUsername } from "./authShared";
import { rateLimiter } from "./rateLimits";
import { reserveUsername, USERNAME_TAKEN_ERROR } from "./usernames";

const PASSWORD_PROVIDER = "password";
const SIGNUP_ROUTE = "/api/auth/password-signup";
const SHARED_IP_FALLBACK = "unknown-ip";
const JSON_HEADERS = { "Content-Type": "application/json" };

const appSiteUrl = process.env.SITE_URL ?? "https://wordclash.co";

const parseAllowedOrigin = (origin: string | null) => {
  if (!origin) {
    return null;
  }

  if (origin === appSiteUrl || origin === "https://www.wordclash.co") {
    return origin;
  }

  try {
    const url = new URL(origin);
    const isLocalhost =
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:");

    return isLocalhost ? origin : null;
  } catch {
    return null;
  }
};

const buildCorsHeaders = (origin: string | null) => {
  const allowedOrigin = parseAllowedOrigin(origin);
  if (!allowedOrigin) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
};

const jsonResponse = (
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
  extraHeaders?: Record<string, string>,
) => {
  const corsHeaders = buildCorsHeaders(origin);
  const headers = {
    ...JSON_HEADERS,
    ...(corsHeaders ?? {}),
    ...(extraHeaders ?? {}),
  };
  return new Response(JSON.stringify(body), { status, headers });
};

const parseForwardedFor = (value: string | null) =>
  value
    ?.split(",")
    .map((part) => part.trim())
    .find(Boolean) ?? null;

const parseForwardedHeader = (value: string | null) => {
  if (!value) {
    return null;
  }

  const firstEntry = value.split(",")[0]?.trim();
  if (!firstEntry) {
    return null;
  }

  const match = firstEntry.match(/for=(?:"?\[?)([a-zA-Z0-9.:\-_]+)(?:\]?"?)/i);
  return match?.[1] ?? null;
};

const getClientIp = (request: Request) => {
  const candidates = [
    request.headers.get("x-vercel-forwarded-for"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    parseForwardedFor(request.headers.get("x-forwarded-for")),
    parseForwardedHeader(request.headers.get("forwarded")),
  ];

  const ip = candidates.find((value) => value && value !== "unknown");
  return ip ?? SHARED_IP_FALLBACK;
};

const isDuplicateSignupError = (error: unknown) =>
  error instanceof Error && error.message.includes("already exists");

export const preparePasswordSignup = internalMutation({
  args: { email: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const normalizedEmail = assertValidEmail(args.email);
    const normalizedUsername = assertValidUsername(args.username);

    const existingPasswordAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", PASSWORD_PROVIDER).eq("providerAccountId", normalizedEmail),
      )
      .unique();

    if (existingPasswordAccount) {
      throw new Error("An account with this email already exists");
    }

    const existingUsers = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizedEmail))
      .take(1);

    if (existingUsers.length > 0) {
      throw new Error("An account with this email already exists");
    }

    await reserveUsername(ctx.db, normalizedUsername);

    return {
      email: normalizedEmail,
      username: normalizedUsername,
    };
  },
});

export const passwordSignup = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    const corsHeaders = buildCorsHeaders(origin);
    if (!corsHeaders) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin, {
      Allow: "POST, OPTIONS",
    });
  }

  if (!buildCorsHeaders(origin)) {
    return jsonResponse(403, { error: "Origin not allowed" }, origin);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, origin);
  }

  if (!body || typeof body !== "object") {
    return jsonResponse(400, { error: "Invalid signup payload" }, origin);
  }

  const { email, password, username } = body as Record<string, unknown>;

  if (typeof email !== "string" || typeof password !== "string" || typeof username !== "string") {
    return jsonResponse(400, { error: "Email, password, and username are required" }, origin);
  }

  let normalizedEmail: string;
  let normalizedUsername: string;

  try {
    normalizedEmail = assertValidEmail(email);
    normalizedUsername = assertValidUsername(username);
    assertValidPassword(password);
  } catch (error) {
    return jsonResponse(
      400,
      { error: error instanceof Error ? error.message : "Invalid signup payload" },
      origin,
    );
  }

  const clientIp = getClientIp(request);
  const rateLimitStatus = await rateLimiter.limit(ctx, "ipSignUps", { key: clientIp });
  if (!rateLimitStatus.ok) {
    const retryAfterMs = Math.ceil(rateLimitStatus.retryAfter);
    const retryAt = Date.now() + retryAfterMs;
    return jsonResponse(
      429,
      {
        error: "Too many signups from this IP address. Please try again later.",
        retryAfterMs,
        retryAt,
      },
      origin,
      { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) },
    );
  }

  let reservedUsername: string | null = null;
  let accountCreated = false;
  let newUserId: string | null = null;

  try {
    const prepared: {
      email: string;
      username: string;
    } = await ctx.runMutation(internal.passwordSignup.preparePasswordSignup, {
      email: normalizedEmail,
      username: normalizedUsername,
    });

    reservedUsername = prepared.username;

    const { user } = await createAccount(ctx, {
      provider: PASSWORD_PROVIDER,
      account: { id: prepared.email, secret: password },
      profile: {
        email: prepared.email,
        name: prepared.username,
        username: prepared.username,
      },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });

    accountCreated = true;
    newUserId = user._id;
    await ctx.runMutation(internal.usernames.attachUsernameToUser, {
      username: prepared.username,
      userId: user._id,
    });
  } catch (error) {
    if (reservedUsername && !accountCreated) {
      await ctx.runMutation(internal.usernames.releaseSignupUsernameReservation, {
        username: reservedUsername,
      });
    }

    if (error instanceof Error && error.message === USERNAME_TAKEN_ERROR) {
      return jsonResponse(409, { error: USERNAME_TAKEN_ERROR }, origin);
    }
    if (isDuplicateSignupError(error)) {
      return jsonResponse(409, { error: "An account with this email already exists" }, origin);
    }
    if (error instanceof Error && error.message === "An account with this email already exists") {
      return jsonResponse(409, { error: error.message }, origin);
    }
    throw error;
  }

  if (newUserId) {
    await ctx.runAction(internal.posthog.identifyUser, {
      distinctId: newUserId,
      properties: {
        username: normalizedUsername,
        email: normalizedEmail,
      },
      setOnce: { signup_method: "password" },
    });
    await ctx.runAction(internal.posthog.captureEvent, {
      distinctId: newUserId,
      event: "user signed up",
      properties: {
        signup_method: "password",
        username: normalizedUsername,
      },
    });
  }

  return jsonResponse(
    201,
    {
      ok: true,
      message: "Account created successfully",
    },
    origin,
  );
});

export { SIGNUP_ROUTE };
