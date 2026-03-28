import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { assertValidEmail } from "./authShared";
const APP_SITE_URL = process.env.SITE_URL ?? "https://wordclash.co";

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
          throw new Error("Password sign up must go through the protected signup endpoint");
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
      if (redirectTo.startsWith("https://wordclash.co")) {
        return redirectTo;
      }
      return APP_SITE_URL;
    },
  },
});
