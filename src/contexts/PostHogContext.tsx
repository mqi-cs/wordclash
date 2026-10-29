import { createContext, useContext } from "react";

export type GameAnalyticsEvent =
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

export interface PostHogContextValue {
  /** Fire a game analytics event with optional properties */
  trackGame: (
    event: GameAnalyticsEvent | string,
    properties?: Record<string, unknown>,
  ) => void;
}

export const PostHogContext = createContext<PostHogContextValue | null>(null);

export function usePostHog() {
  const ctx = useContext(PostHogContext);
  if (!ctx) {
    throw new Error("usePostHog must be used inside PostHogProvider");
  }
  return ctx;
}
