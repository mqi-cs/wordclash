const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const assertValidEmail = (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error("Please enter a valid email address");
  }
  return normalizedEmail;
};

export const normalizeUsername = (username: string) => username.trim();

export const assertValidUsername = (username: string) => {
  const normalizedUsername = normalizeUsername(username);
  if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
    throw new Error("Username must be between 3 and 20 characters");
  }
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    throw new Error(
      "Username can only contain letters, numbers, underscores, and hyphens",
    );
  }
  return normalizedUsername;
};

export const assertValidPassword = (password: string) => {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return password;
};
