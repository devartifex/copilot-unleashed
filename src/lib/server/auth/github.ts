import { config } from '../config.js';

// ╔══════════════════════════════════════════════════════════════╗
// ║ DEMO — Step 1: Autenticazione con GitHub Device Flow        ║
// ║ Nessun client secret, nessun redirect URI.                  ║
// ║ L'utente inserisce un codice su github.com/login/device.    ║
// ╚══════════════════════════════════════════════════════════════╝

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

// Scopes required: copilot (SDK access), read:user (profile), repo (workspace context)
const GITHUB_SCOPES = 'copilot read:user repo';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  /** URL shown to the user: https://github.com/login/device */
  verification_uri: string;
  expires_in: number;
  /** Minimum polling interval in seconds (usually 5) */
  interval: number;
}

/** Status values returned by GitHub while the user completes authorization */
export type DevicePollStatus = 'pending' | 'slow_down' | 'authorized' | 'access_denied' | 'expired';

/** Step 1a: Request a device code. GitHub returns a user_code to display and a device_code to poll with. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: config.github.clientId, scope: GITHUB_SCOPES }),
  });

  const data = (await res.json()) as Record<string, string | number>;
  if (data.error) throw new Error((data.error_description as string) || (data.error as string));
  return data as unknown as DeviceCodeResponse;
}

/**
 * Step 1b: Poll until the user authorizes (or denies / the code expires).
 * Called on a timer from the `/auth/device/poll` endpoint.
 */
export async function pollForToken(
  deviceCode: string
): Promise<{ status: DevicePollStatus; token?: string }> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.github.clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = (await res.json()) as Record<string, string>;

  if (data.error === 'authorization_pending') return { status: 'pending' };
  if (data.error === 'slow_down') return { status: 'slow_down' };
  if (data.error === 'access_denied') return { status: 'access_denied' };
  if (data.error === 'expired_token') return { status: 'expired' };
  if (data.error) throw new Error(data.error_description || data.error);

  return { status: 'authorized', token: data.access_token };
}

export type TokenValidationResult =
  | { valid: true; user: { login: string; name: string } }
  | { valid: false; reason: 'invalid_token' | 'api_error' };

/**
 * Validate a GitHub token against the API and return the user profile.
 * Called on every WebSocket connection to catch revoked tokens early.
 */
export async function validateGitHubToken(
  token: string
): Promise<TokenValidationResult> {
  try {
    const res = await fetch(`${GITHUB_API_URL}/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      return { valid: false, reason: 'invalid_token' };
    }

    // 403 can mean rate-limiting, IP block, or scope issues — not necessarily
    // a revoked token. Treat as transient so the caller doesn't nuke auth.
    if (res.status === 403) {
      return { valid: false, reason: 'api_error' };
    }

    if (!res.ok) {
      return { valid: false, reason: 'api_error' };
    }

    const user = (await res.json()) as Record<string, string>;
    return { valid: true, user: { login: user.login, name: user.name || user.login } };
  } catch {
    return { valid: false, reason: 'api_error' };
  }
}
