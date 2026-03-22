import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';

/**
 * Encrypted auth cookie — persists auth state across server restarts / deploys.
 *
 * Uses AES-256-GCM with HKDF-derived key from SESSION_SECRET.
 * Each seal uses a fresh random IV, making identical payloads produce different ciphertexts.
 */

export const AUTH_COOKIE_NAME = '__copilot_auth';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HKDF_INFO = 'copilot-auth-cookie';

export interface AuthCookiePayload {
  githubToken: string;
  githubUser: { login: string; name: string };
  githubAuthTime: number;
}

function deriveKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, '', HKDF_INFO, 32),
  );
}

/**
 * Encrypt auth data into a cookie-safe string.
 * Format: base64(iv ‖ ciphertext ‖ authTag)
 */
export function sealAuth(data: AuthCookiePayload, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]).toString('base64url');
}

/**
 * Decrypt and validate an auth cookie.
 * Returns null on any failure (wrong secret, tampered data, expired, malformed).
 */
export function unsealAuth(
  sealed: string,
  secret: string,
  maxAgeMs?: number,
): AuthCookiePayload | null {
  try {
    const raw = Buffer.from(sealed, 'base64url');

    if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return null;

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(raw.length - AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH, raw.length - AUTH_TAG_LENGTH);

    const key = deriveKey(secret);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const data = JSON.parse(plaintext) as AuthCookiePayload;

    if (!data.githubToken || !data.githubUser?.login || typeof data.githubAuthTime !== 'number') {
      return null;
    }

    if (maxAgeMs !== undefined && Date.now() - data.githubAuthTime > maxAgeMs) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Parse a specific cookie value from a raw Cookie header string.
 * Avoids pulling in a full cookie-parsing library for server.js.
 */
export function parseCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return undefined;
}
