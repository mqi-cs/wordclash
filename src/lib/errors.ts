import { ConvexError } from "convex/values";

// Convex replaces the message of a plain Error with "Server Error" in
// production; user-facing failures are thrown as ConvexError and their text
// lives in `data`.
export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};
