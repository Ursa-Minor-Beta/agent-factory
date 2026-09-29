/**
 * Check if an origin matches an allowed origin pattern (supports wildcards)
 *
 * @param origin - The origin to check (e.g., "https://app.example.com")
 * @param pattern - The pattern to match against (e.g., "https://*.example.com" or "https://app.example.com")
 * @returns true if the origin matches the pattern
 *
 * @example
 * matchOrigin("https://app.example.com", "https://*.example.com") // true
 * matchOrigin("https://app.example.com", "https://app.example.com") // true
 * matchOrigin("https://evil.com", "https://*.example.com") // false
 */
export function matchOrigin(origin: string, pattern: string): boolean {
  // Exact match
  if (origin === pattern) {
    return true;
  }

  // Check for wildcard pattern
  if (pattern.includes('*')) {
    // Convert wildcard pattern to regex
    // Escape special regex characters except *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(origin);
  }

  return false;
}

/**
 * Check if an origin is allowed based on a list of allowed origin patterns
 *
 * @param origin - The origin to check
 * @param allowedOrigins - Array of allowed origin patterns (supports wildcards)
 * @returns true if the origin is allowed
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some(pattern => matchOrigin(origin, pattern));
}
