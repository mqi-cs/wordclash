import { createContext, useContext } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_SITE_URL = "https://wordclash.co";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isValidEmail = (email: string) => EMAIL_REGEX.test(normalizeEmail(email));

type User = {
  id: string; // we'll map Convex _id to id so we don't break too many things
  email?: string;
  name?: string;
  username?: string;
  googleName?: string;
};

type SignUpResult = {
  error: string | null;
  retryAt?: number | null;
  retryAfterMs?: number | null;
};

interface AuthContextType {
  user: User | null;
  session: Record<string, never> | null; // Convex Auth manages session internally
  signUp: (email: string, password: string, username: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeUsername = (username: string) => username.trim();
const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const getConvexHttpActionBaseUrl = (
  siteUrl: string | undefined,
  deploymentUrl: string | undefined,
) => {
  if (siteUrl) {
    return new URL(siteUrl).origin;
  }

  if (!deploymentUrl) {
    throw new Error("Missing Convex URL configuration");
  }

  const url = new URL(deploymentUrl);
  if (url.hostname.endsWith(".convex.cloud")) {
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  }
  return url.origin;
};

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
  const user: User | null = viewer ? {
    id: viewer._id,
    email: viewer.email,
    name: viewer.name,
    username: viewer.username,
    googleName: viewer.googleName,
  } : null;

  const signUp = async (email: string, password: string, username: string) => {
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
  };

  const signIn = async (email: string, password: string) => {
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
  };

  const signInWithGoogle = async () => {
    try {
      await convexSignIn("google", { redirectTo: APP_SITE_URL });
      return { error: null };
    } catch (err: unknown) {
      console.error("Google sign-in error", err);
      return { error: getErrorMessage(err, "Failed to sign in with Google") };
    }
  };

  const signOut = async () => {
    await convexSignOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session: isAuthenticated ? {} : null,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
