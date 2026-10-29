import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { assertValidEmail } from "./authShared";
import { ConvexError } from "convex/values";
const APP_SITE_URL = process.env.SITE_URL ?? "https://wordclash.co";
const ALLOWED_REDIRECT_ORIGINS = new Set([
  new URL(APP_SITE_URL).origin,
  "https://wordclash.co",
  "https://www.wordclash.co",
]);

// Compare parsed origins rather than string prefixes, so that hosts like
// "https://wordclash.co.attacker.com" can't pass as our own site.
export const isAllowedRedirect = (redirectTo: string) => {
  try {
    return ALLOWED_REDIRECT_ORIGINS.has(new URL(redirectTo).origin);
  } catch {
    return false;
  }
};

const googleClientId = process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET;

const oauthProviders =
  googleClientId && googleClientSecret
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          profile(profile) {
            const email = assertValidEmail(profile.email as string);
            const name = typeof profile.name === "string" ? profile.name.trim() : undefined;
            return {
              id: String(profile.sub ?? profile.id),
              name,
              email,
              googleName: name,
              image: typeof profile.picture === "string" ? profile.picture : undefined,
            };
          },
        }),
      ]
    : [];

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (params.flow === "signUp") {
          throw new ConvexError("Password sign up must go through the protected signup endpoint");
        }
        const email = assertValidEmail(params.email as string);
        const username =
          typeof params.username === "string" ? params.username.trim() : undefined;
        return {
          email,
          ...(username ? { name: username, username } : {}),
        };
      },
    }),
    ...oauthProviders,
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${APP_SITE_URL}${redirectTo}`;
      }
      if (isAllowedRedirect(redirectTo)) {
        return redirectTo;
      }
      return APP_SITE_URL;
    },
  },
});
