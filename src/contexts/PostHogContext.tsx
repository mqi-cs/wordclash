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
  isPostHogInitialised,
  setUserProperties,
} from "@/lib/posthog";

type GameAnalyticsEvent =
  | "session_started"
  | "auth_signed_in"
  | "auth_signed_out"
  | "game_started"
  | "game_completed"
  | "game_abandoned"
  | "bot_game_started"
  | "bot_game_completed"
  | "hint_used"
  | "mode_selected"
  | "page_view"
  | "friend_search"
  | "friend_request_sent"
  | "game_deleted"
  | "game_resumed"
  | "multiplayer_game_joined"
  | "multiplayer_lobby_created"
  | "multiplayer_game_started"
  | "onboarding_viewed"
  | "onboarding_slide_viewed"
  | "onboarding_completed";

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
  const sessionTrackedRef = useRef(false);

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
      setUserProperties({
        has_signed_up: true,
        auth_state: "authenticated",
        last_seen_at: new Date().toISOString(),
      });
      if (prevUserIdRef.current === null && isPostHogInitialised()) {
        rawCaptureEvent("auth_signed_in", {
          user_id: currentUserId,
          auth_state: "authenticated",
        });
      }
    } else if (!currentUserId && prevUserIdRef.current) {
      // User signed out
      if (isPostHogInitialised()) {
        rawCaptureEvent("auth_signed_out", {
          previous_user_id: prevUserIdRef.current,
          auth_state: "anonymous",
        });
      }
      resetUser();
    }

    prevUserIdRef.current = currentUserId;
  }, [user, loading]);

  useEffect(() => {
    if (loading || sessionTrackedRef.current || !isPostHogInitialised()) return;

    const timestamp = new Date().toISOString();
    rawCaptureEvent("session_started", {
      auth_state: user ? "authenticated" : "anonymous",
      has_signed_up: !!user,
      session_entry_path: window.location.pathname,
      session_entry_url: window.location.href,
      started_at: timestamp,
    });
    setUserProperties({
      auth_state: user ? "authenticated" : "anonymous",
      has_signed_up: !!user,
      last_seen_at: timestamp,
    });
    sessionTrackedRef.current = true;
  }, [loading, user]);

  const trackGame = useCallback(
    (event: GameAnalyticsEvent | string, properties?: Record<string, unknown>) => {
      const base: Record<string, unknown> = {
        is_authenticated: !!user,
        auth_state: user ? "authenticated" : "anonymous",
        has_signed_up: !!user,
        ...(user ? { user_id: user.id, username: user.username } : {}),
        ...(typeof window !== "undefined"
          ? {
              pathname: window.location.pathname,
              current_url: window.location.href,
            }
          : {}),
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
