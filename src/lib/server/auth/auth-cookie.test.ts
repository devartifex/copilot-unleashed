// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { sealAuth, unsealAuth, parseCookieValue, AUTH_COOKIE_NAME, type AuthCookiePayload } from './auth-cookie';

const SECRET = 'test-session-secret-at-least-32-chars-long';

const VALID_PAYLOAD: AuthCookiePayload = {
  githubToken: 'gho_abc123def456',
  githubUser: { login: 'octocat', name: 'The Octocat' },
  githubAuthTime: Date.now(),
};

describe('auth-cookie', () => {
  describe('sealAuth / unsealAuth', () => {
    it('round-trips a valid payload', () => {
      const sealed = sealAuth(VALID_PAYLOAD, SECRET);
      const result = unsealAuth(sealed, SECRET);

      expect(result).toEqual(VALID_PAYLOAD);
    });

    it('produces different ciphertexts for the same payload (random IV)', () => {
      const a = sealAuth(VALID_PAYLOAD, SECRET);
      const b = sealAuth(VALID_PAYLOAD, SECRET);

      expect(a).not.toBe(b);
    });

    it('returns null for a wrong secret', () => {
      const sealed = sealAuth(VALID_PAYLOAD, SECRET);
      const result = unsealAuth(sealed, 'wrong-secret-that-is-long-enough');

      expect(result).toBeNull();
    });

    it('returns null for tampered ciphertext', () => {
      const sealed = sealAuth(VALID_PAYLOAD, SECRET);
      // Flip a character in the middle
      const tampered = sealed.slice(0, 10) + (sealed[10] === 'a' ? 'b' : 'a') + sealed.slice(11);
      const result = unsealAuth(tampered, SECRET);

      expect(result).toBeNull();
    });

    it('returns null for truncated data', () => {
      const sealed = sealAuth(VALID_PAYLOAD, SECRET);
      const result = unsealAuth(sealed.slice(0, 10), SECRET);

      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(unsealAuth('', SECRET)).toBeNull();
    });

    it('returns null for non-base64 garbage', () => {
      expect(unsealAuth('not-valid-base64!!!', SECRET)).toBeNull();
    });

    it('returns null when authTime exceeds maxAgeMs', () => {
      const oldPayload: AuthCookiePayload = {
        ...VALID_PAYLOAD,
        githubAuthTime: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
      };
      const sealed = sealAuth(oldPayload, SECRET);
      const result = unsealAuth(sealed, SECRET, 7 * 24 * 60 * 60 * 1000); // 7-day max

      expect(result).toBeNull();
    });

    it('accepts payload when authTime is within maxAgeMs', () => {
      const recentPayload: AuthCookiePayload = {
        ...VALID_PAYLOAD,
        githubAuthTime: Date.now() - 1000, // 1 second ago
      };
      const sealed = sealAuth(recentPayload, SECRET);
      const result = unsealAuth(sealed, SECRET, 7 * 24 * 60 * 60 * 1000);

      expect(result).toEqual(recentPayload);
    });

    it('accepts payload when maxAgeMs is not provided', () => {
      const oldPayload: AuthCookiePayload = {
        ...VALID_PAYLOAD,
        githubAuthTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      };
      const sealed = sealAuth(oldPayload, SECRET);
      const result = unsealAuth(sealed, SECRET);

      expect(result).toEqual(oldPayload);
    });

    it('returns null for payload missing githubToken', () => {
      const badPayload = { githubUser: { login: 'octocat', name: 'Octo' }, githubAuthTime: Date.now() };
      // Manually seal a bad payload by casting
      const sealed = sealAuth(badPayload as AuthCookiePayload, SECRET);
      const result = unsealAuth(sealed, SECRET);

      expect(result).toBeNull();
    });

    it('returns null for payload missing githubUser.login', () => {
      const badPayload = { githubToken: 'tok', githubUser: { name: 'Octo' }, githubAuthTime: Date.now() };
      const sealed = sealAuth(badPayload as unknown as AuthCookiePayload, SECRET);
      const result = unsealAuth(sealed, SECRET);

      expect(result).toBeNull();
    });

    it('returns null for payload with non-number githubAuthTime', () => {
      const badPayload = { githubToken: 'tok', githubUser: { login: 'x', name: 'X' }, githubAuthTime: 'not-a-number' };
      const sealed = sealAuth(badPayload as unknown as AuthCookiePayload, SECRET);
      const result = unsealAuth(sealed, SECRET);

      expect(result).toBeNull();
    });
  });

  describe('parseCookieValue', () => {
    it('extracts a cookie value from a header string', () => {
      const header = 'connect.sid=s%3Aabc; __copilot_auth=sealed123; other=val';
      expect(parseCookieValue(header, '__copilot_auth')).toBe('sealed123');
    });

    it('returns undefined for a missing cookie', () => {
      const header = 'connect.sid=s%3Aabc; other=val';
      expect(parseCookieValue(header, '__copilot_auth')).toBeUndefined();
    });

    it('returns undefined for undefined header', () => {
      expect(parseCookieValue(undefined, '__copilot_auth')).toBeUndefined();
    });

    it('handles cookie value with equals signs', () => {
      const header = '__copilot_auth=abc=def=ghi';
      expect(parseCookieValue(header, '__copilot_auth')).toBe('abc=def=ghi');
    });

    it('handles whitespace around cookie pairs', () => {
      const header = '  __copilot_auth = value123 ; other=x';
      expect(parseCookieValue(header, '__copilot_auth')).toBeUndefined(); // space before = means the prefix doesn't match
    });

    it('returns first match for duplicate cookie names', () => {
      const header = '__copilot_auth=first; __copilot_auth=second';
      expect(parseCookieValue(header, '__copilot_auth')).toBe('first');
    });
  });

  describe('AUTH_COOKIE_NAME', () => {
    it('is the expected value', () => {
      expect(AUTH_COOKIE_NAME).toBe('__copilot_auth');
    });
  });
});
