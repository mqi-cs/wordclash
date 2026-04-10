/**
 * PostHogProvider — wraps the app to initialise PostHog on mount
 * and automatically identify / reset users as auth state changes.
 */
import { useEffect, useRef, createContext, useContext, useMemo, useCallback } from "react";
import { useAuth } from "./AuthContext";
import {
  initPostHog,
  identifyUser,
  resetUser,
  captureEvent as rawCaptureEvent,
} from "@/lib/posthog";

type GameAnalyticsEvent =
  | "game_started_client"
  | "game_completed_client"
  | "game_abandoned_client"
  | "bot_game_started"
  | "bot_game_completed"
  | "hint_used_client"
  | "mode_selected"
  | "page_view";

interface PostHogContextValue {
  /** Fire a game analytics event with optional properties */
  trackGame: (
    event: GameAnalyticsEvent | string,
    properties?: Record<string, unknown>,
  ) => void;
}

const PostHogContext = createContext<PostHogContextValue | null>(null);

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  // Initialise PostHog once on mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Identify / reset when auth changes
  useEffect(() => {
    if (loading) return;

    const currentUserId = user?.id ?? null;

    if (currentUserId && currentUserId !== prevUserIdRef.current) {
      // User signed in (or switched account)
      identifyUser(currentUserId, {
        username: user?.username,
        email: user?.email,
        name: user?.name ?? user?.googleName,
      });
    } else if (!currentUserId && prevUserIdRef.current) {
      // User signed out
      resetUser();
    }

    prevUserIdRef.current = currentUserId;
  }, [user, loading]);

  const trackGame = useCallback(
    (event: GameAnalyticsEvent | string, properties?: Record<string, unknown>) => {
      const base: Record<string, unknown> = {
        is_authenticated: !!user,
        ...(user ? { user_id: user.id, username: user.username } : {}),
      };
      rawCaptureEvent(event, { ...base, ...properties });
    },
    [user],
  );

  const value = useMemo(() => ({ trackGame }), [trackGame]);

  return (
    <PostHogContext.Provider value={value}>
      {children}
    </PostHogContext.Provider>
  );
}

export function usePostHog() {
  const ctx = useContext(PostHogContext);
  if (!ctx) {
    throw new Error("usePostHog must be used inside PostHogProvider");
  }
  return ctx;
}
