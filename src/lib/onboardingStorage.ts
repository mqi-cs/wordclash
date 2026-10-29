// Remembers which first-run guides the player has already seen. Kept out of
// the guide components so those files only export components.
const TOUR_KEY = "wordclash_tour_seen";
const ONBOARDING_KEY = "wordclash_onboarding_seen";

export const hasSeenTour = (): boolean => localStorage.getItem(TOUR_KEY) === "true";

export const markTourSeen = (): void => localStorage.setItem(TOUR_KEY, "true");

export const markOnboardingSeen = (): void => localStorage.setItem(ONBOARDING_KEY, "true");
