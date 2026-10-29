import { useCallback, useMemo } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getErrorMessage } from "@/lib/errors";
import { AuthContext, getConvexHttpActionBaseUrl, type User } from "./AuthContext";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_SITE_URL = "https://wordclash.co";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isValidEmail = (email: string) => EMAIL_REGEX.test(normalizeEmail(email));

const normalizeUsername = (username: string) => username.trim();

const getSignupEndpoint = () =>
  new URL(
    "/api/auth/password-signup",
    getConvexHttpActionBaseUrl(
      import.meta.env.VITE_CONVEX_SITE_URL as string | undefined,
      import.meta.env.VITE_CONVEX_URL as string | undefined,
    ),
  ).toString();

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const { signIn: convexSignIn, signOut: convexSignOut } = useAuthActions();
  
  // Use `skip` when not authenticated to avoid unnecessary queries
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");

  // Determine overall loading state. If auth is loading, or if we authenticated but viewer query is pending
  const loading = isAuthLoading || (isAuthenticated && viewer === undefined);

  // Map Convex user to abstract User
  const user: User | null = useMemo(() => viewer ? {
    id: viewer._id,
    email: viewer.email,
    name: viewer.name,
    username: viewer.username,
    googleName: viewer.googleName,
  } : null, [viewer]);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return { error: "Please enter a valid email address" };
    }

    try {
      const response = await fetch(getSignupEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          username: normalizeUsername(username),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            retryAt?: number;
            retryAfterMs?: number;
          }
        | null;

      if (response.ok) {
        return { error: null };
      }

      return {
        error: data?.error ?? "Failed to sign up",
        retryAt: data?.retryAt ?? null,
        retryAfterMs: data?.retryAfterMs ?? null,
      };
    } catch (err: unknown) {
      console.error("SignUp error", err);
      return { error: getErrorMessage(err, "Failed to sign up") };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await convexSignIn("password", {
        email: normalizeEmail(email),
        password,
        flow: "signIn",
      });
      return { error: null };
    } catch (err: unknown) {
      console.error("SignIn error", err);
      // Convex Auth throws when credentials mismatch
      return { error: "Invalid email or password" };
    }
  }, [convexSignIn]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await convexSignIn("google", { redirectTo: APP_SITE_URL });
      return { error: null };
    } catch (err: unknown) {
      console.error("Google sign-in error", err);
      return { error: getErrorMessage(err, "Failed to sign in with Google") };
    }
  }, [convexSignIn]);

  const signOut = useCallback(async () => {
    await convexSignOut();
  }, [convexSignOut]);

  const contextValue = useMemo(() => ({
    user,
    session: isAuthenticated ? {} : null,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    loading,
  }), [user, isAuthenticated, loading, signUp, signIn, signInWithGoogle, signOut]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
