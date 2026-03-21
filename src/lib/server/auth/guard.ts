import { config } from '../config.js';
import { logSecurity } from '../security-log.js';
import { validateGitHubToken } from './github.js';
import { clearAuth } from './session-utils.js';

export interface GitHubUser {
  login: string;
  name: string;
}

export interface SessionData {
  githubToken?: string;
  githubUser?: GitHubUser;
  githubAuthTime?: number;
  githubDeviceCode?: string;
  githubDeviceExpiry?: number;
  save(callback: (err?: Error) => void): void;
  destroy(callback: (err?: Error) => void): void;
}

export interface AuthResult {
  authenticated: boolean;
  user: GitHubUser | null;
  error?: string;
}

export interface RevalidationResult {
  valid: boolean;
}

const REVALIDATION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export async function revalidateTokenIfStale(
  session: SessionData
): Promise<RevalidationResult> {
  const authAge = session.githubAuthTime
    ? Date.now() - session.githubAuthTime
    : Infinity;

  if (authAge <= REVALIDATION_INTERVAL_MS) {
    return { valid: true };
  }

  if (!session.githubToken) {
    return { valid: false };
  }

  const validation = await validateGitHubToken(session.githubToken);

  if (!validation.valid && validation.reason === 'invalid_token') {
    logSecurity('warn', 'http_token_revoked', {
      user: session.githubUser?.login,
    });
    await clearAuth(session);
    return { valid: false };
  }

  // Transient API errors — don't lock out users on GitHub outages
  if (!validation.valid && validation.reason === 'api_error') {
    return { valid: true };
  }

  session.githubAuthTime = Date.now();
  return { valid: true };
}

export function checkAuth(session: SessionData | null | undefined): AuthResult {
  if (!session?.githubToken) {
    return { authenticated: false, user: null, error: 'GitHub authentication required' };
  }

  const authTime = session.githubAuthTime;
  if (typeof authTime === 'number' && Date.now() - authTime > config.tokenMaxAge) {
    logSecurity('info', 'token_expired', {
      user: session.githubUser?.login,
      reason: 'max_age_exceeded',
    });
    return { authenticated: false, user: null, error: 'Session expired. Please sign in again.' };
  }

  if (config.allowedUsers.length > 0) {
    const login = session.githubUser?.login?.trim().toLowerCase();

    if (!login || !config.allowedUsers.includes(login)) {
      logSecurity('warn', 'auth_denied_not_allowed', {
        user: session.githubUser?.login,
      });
      return {
        authenticated: false,
        user: null,
        error: 'Your GitHub account is not authorized to use this application.',
      };
    }
  }

  return { authenticated: true, user: session.githubUser ?? null };
}
