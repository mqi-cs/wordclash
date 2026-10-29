import { createContext, useContext } from "react";

export type User = {
  id: string; // we'll map Convex _id to id so we don't break too many things
  email?: string;
  name?: string;
  username?: string;
  googleName?: string;
};

export type SignUpResult = {
  error: string | null;
  retryAt?: number | null;
  retryAfterMs?: number | null;
};

export interface AuthContextType {
  user: User | null;
  session: Record<string, never> | null; // Convex Auth manages session internally
  signUp: (email: string, password: string, username: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
