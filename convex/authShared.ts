import { ConvexError } from "convex/values";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const assertValidEmail = (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new ConvexError("Please enter a valid email address");
  }
  return normalizedEmail;
};

export const normalizeUsername = (username: string) => username.trim();

export const assertValidUsername = (username: string) => {
  const normalizedUsername = normalizeUsername(username);
  if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
    throw new ConvexError("Username must be between 3 and 20 characters");
  }
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    throw new ConvexError(
      "Username can only contain letters, numbers, underscores, and hyphens",
    );
  }
  return normalizedUsername;
};

export const assertValidPassword = (password: string) => {
  if (password.length < 8) {
    throw new ConvexError("Password must be at least 8 characters");
  }
  return password;
};

// Message of an error thrown by our own functions, whether it arrives as a
// ConvexError (user-facing, survives production redaction) or a plain Error.
export const getErrorText = (error: unknown) => {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : "";
};
