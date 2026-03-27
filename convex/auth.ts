import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_SITE_URL = process.env.SITE_URL ?? "https://wordclash.co";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const assertValidEmail = (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error("Please enter a valid email address");
  }
  return normalizedEmail;
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
            return {
              email,
              googleName: typeof profile.name === "string" ? profile.name.trim() : undefined,
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
      if (redirectTo.startsWith(APP_SITE_URL)) {
        return redirectTo;
      }
      return APP_SITE_URL;
    },
  },
});
