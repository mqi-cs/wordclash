/**
 * PostHog client-side analytics & session recording.
 *
 * Works for both authenticated and anonymous users:
 * - Anonymous users get an auto-generated distinct_id from PostHog
 * - Authenticated users are identified with their Convex userId
 *   so server-side and client-side events merge into one profile
 */
import posthog from "posthog-js";

const POSTHOG_KEY = "phc_qjREusjdMqe4hB4h6XcGpxuFrT7QbnrmpgY5wWv9zUUW";
const POSTHOG_HOST = "https://eu.i.posthog.com";

let initialised = false;

/** Initialise PostHog — safe to call multiple times */
export function initPostHog() {
  if (initialised || typeof window === "undefined") return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Session recordings
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    // Don't wait for feature flags to load before recordings
    advanced_disable_feature_flags: false,
  });

  initialised = true;
}

/**
 * Link a signed-in user to the PostHog anonymous profile.
 * Call this whenever the auth state transitions to "signed in".
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!initialised) return;
  posthog.identify(userId, properties);
}

/** Reset identity on sign-out so sub-sequent sessions are anonymous */
export function resetUser() {
  if (!initialised) return;
  posthog.reset();
}

/**
 * Capture a custom event — works for both logged-in and anonymous users.
 * PostHog will automatically attach the correct `distinct_id`.
 */
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialised) return;
  posthog.capture(event, properties);
}

/** Convenience: set user properties without an event */
export function setUserProperties(properties: Record<string, unknown>) {
  if (!initialised) return;
  posthog.people.set(properties);
}

export { posthog };
