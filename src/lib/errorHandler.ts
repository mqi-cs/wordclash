/**
 * Maps database and API errors to user-friendly messages
 * Prevents exposing internal details like table names, column names, etc.
 */
export function getUserFriendlyError(error: unknown): string {
  if (!error) return 'An error occurred. Please try again.';
  
  const err = error as Record<string, unknown>;
  const code = err?.code as string | undefined;
  const message = (err?.message as string)?.toLowerCase() || '';
  
  // Map specific Postgres/Supabase error codes to user messages
  const errorCodeMap: Record<string, string> = {
    // Postgres constraint violations
    '23505': 'This item already exists',
    '23503': 'Related item not found',
    '23502': 'Required information is missing',
    '23514': 'Invalid data provided',
    
    // RLS/Permission errors
    '42501': 'You do not have permission to perform this action',
    '42P01': 'Unable to complete request',
    
    // Supabase/PostgREST errors
    'PGRST116': 'Item not found',
    'PGRST301': 'Unable to connect. Please try again.',
    'PGRST204': 'No data found',
    
    // Auth errors
    'invalid_credentials': 'Invalid email or password',
    'user_not_found': 'Account not found',
    'email_taken': 'An account with this email already exists',
    'weak_password': 'Password is too weak. Please use at least 8 characters.',
    'invalid_email': 'Please enter a valid email address',
  };
  
  // Check for specific error codes
  if (code && errorCodeMap[code]) {
    return errorCodeMap[code];
  }
  
  // Check for common error message patterns (case-insensitive)
  if (message.includes('row-level security') || message.includes('rls')) {
    return 'You do not have permission to perform this action';
  }
  
  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return 'Invalid email or password';
  }
  
  if (message.includes('email not confirmed')) {
    return 'Please verify your email before signing in';
  }
  
  if (message.includes('user already registered') || message.includes('already exists')) {
    return 'An account with this email already exists';
  }
  
  if (message.includes('network') || message.includes('fetch')) {
    return 'Network error. Please check your connection.';
  }
  
  if (message.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  
  if (message.includes('not found') || message.includes('does not exist')) {
    return 'The requested item was not found';
  }
  
  if (message.includes('unauthorized') || message.includes('jwt')) {
    return 'Your session has expired. Please sign in again.';
  }
  
  // Log detailed error in development only
  if (import.meta.env.DEV) {
    console.error('Database error:', error);
  }
  
  // Return generic message for unknown errors
  return 'An error occurred. Please try again.';
}

/**
 * Type guard to check if something is an Error-like object
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error || (
    typeof value === 'object' &&
    value !== null &&
    'message' in value
  );
}
