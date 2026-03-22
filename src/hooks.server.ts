import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getSessionById } from '$lib/server/session-store';
import { checkAuth, revalidateTokenIfStale } from '$lib/server/auth/guard.js';
import { unsealAuth, parseCookieValue, AUTH_COOKIE_NAME } from '$lib/server/auth/auth-cookie.js';
import { config } from '$lib/server/config.js';
import { initServerSideEffects } from '$lib/server/init.js';

initServerSideEffects();

// Extract express-session from the bridge and attach to event.locals
const sessionHandle: Handle = async ({ event, resolve }) => {
	const sessionId = event.request.headers.get('x-session-id');
	console.log(`[HOOKS] ${event.request.method} ${event.url.pathname} sessionId=${sessionId ?? 'NONE'}`);
	if (sessionId) {
		const session = getSessionById(sessionId) ?? null;
		console.log(`[HOOKS] session resolved: hasSession=${!!session} hasToken=${!!session?.githubToken} user=${session?.githubUser?.login ?? 'none'}`);

		// Restore auth from encrypted cookie when session file was lost (e.g. deploy wipe)
		if (session && !session.githubToken) {
			const sealed = parseCookieValue(event.request.headers.get('cookie') ?? undefined, AUTH_COOKIE_NAME);
			if (sealed) {
				const data = unsealAuth(sealed, config.sessionSecret, config.tokenMaxAge);
				if (data) {
					session.githubToken = data.githubToken;
					session.githubUser = data.githubUser;
					session.githubAuthTime = data.githubAuthTime;
					session.save(() => {});
					console.log(`[HOOKS] Restored auth from cookie for user=${data.githubUser.login}`);
				}
			}
		}

		event.locals.session = session;
	} else {
		console.log(`[HOOKS] NO x-session-id header — session will be null`);
		event.locals.session = null;
	}
	return resolve(event);
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  const isDev = process.env.NODE_ENV !== 'production';

  // Skip strict CSP in dev mode — Vite HMR uses blob: workers and eval
  if (!isDev) {
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws: wss: https://*.push.services.mozilla.com https://*.push.apple.com https://fcm.googleapis.com https://*.notify.windows.com",
      "worker-src 'self' blob:",
      "img-src 'self' data: blob: https://avatars.githubusercontent.com",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
    ].join('; '));

    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Security headers (always)
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
};

// CSRF origin check for state-changing methods
const csrfProtection: Handle = async ({ event, resolve }) => {
  const method = event.request.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return resolve(event);
  }

  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) return resolve(event);

  const origin = event.request.headers.get('origin');
  if (origin) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const expected = new URL(baseUrl).origin;
    if (origin !== expected) {
      return new Response('Forbidden', { status: 403 });
    }
  } else {
    // Reject state-changing requests without Origin in production.
    // Exempt /api/sessions/sync which uses Bearer token auth from scripts.
    const path = event.url.pathname;
    if (!path.startsWith('/api/sessions/sync')) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return resolve(event);
};

// Rate limiting with periodic cleanup to prevent unbounded Map growth
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 200;

// Purge expired entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW);

const rateLimit: Handle = async ({ event, resolve }) => {
  const ip = event.getClientAddress();
  const now = Date.now();

  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  return resolve(event);
};

// Periodic token revalidation — verify revoked tokens against GitHub API
const tokenRevalidation: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;

  // Skip auth routes (they handle their own token logic)
  if (path.startsWith('/auth/')) {
    return resolve(event);
  }

  const session = event.locals.session;
  if (!session) {
    return resolve(event);
  }

  const auth = checkAuth(session);
  if (!auth.authenticated) {
    return resolve(event);
  }

  const result = await revalidateTokenIfStale(session);
  if (!result.valid) {
    // Token was revoked — clear encrypted auth cookie so it doesn't restore a dead token
    event.cookies.delete(AUTH_COOKIE_NAME, { path: '/' });
    return new Response(JSON.stringify({ error: 'Token revoked. Please sign in again.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return resolve(event);
};

export const handle: Handle = sequence(sessionHandle, tokenRevalidation, csrfProtection, securityHeaders, rateLimit);
