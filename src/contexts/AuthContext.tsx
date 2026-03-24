import { createContext, useContext, useEffect, useState } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type User = {
  id: string; // we'll map Convex _id to id so we don't break too many things
  email?: string;
  name?: string;
};

interface AuthContextType {
  user: User | null;
  session: any | null; // Convex Auth manages session internally
  signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  } : null;

  const signUp = async (email: string, password: string, username: string) => {
    try {
      await convexSignIn("password", { email, password, username, flow: "signUp" });
      return { error: null };
    } catch (err: any) {
      console.error("SignUp error", err);
      return { error: err.message || "Failed to sign up" };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await convexSignIn("password", { email, password, flow: "signIn" });
      return { error: null };
    } catch (err: any) {
      console.error("SignIn error", err);
      // Convex Auth throws when credentials mismatch
      return { error: "Invalid email or password" };
    }
  };

  const signOut = async () => {
    await convexSignOut();
  };

  return (
    <AuthContext.Provider value={{ user, session: isAuthenticated ? {} : null, signUp, signIn, signOut, loading }}>
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
