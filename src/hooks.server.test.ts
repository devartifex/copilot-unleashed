// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SessionLike {
	githubToken?: string;
	githubUser?: {
		login?: string;
	};
}

interface MockEvent {
	request: Request;
	url: URL;
	locals: {
		session?: SessionLike | null;
	};
	cookies: {
		delete: ReturnType<typeof vi.fn>;
	};
	getClientAddress: () => string;
}

type MockResolve = (event: MockEvent) => Promise<Response>;
type HookHandle = (input: { event: MockEvent; resolve: MockResolve }) => Promise<Response>;

const { mockGetSessionById, mockCheckAuth, mockRevalidateTokenIfStale } = vi.hoisted(() => ({
	mockGetSessionById: vi.fn<(sessionId: string) => SessionLike | undefined>(),
	mockCheckAuth: vi.fn<() => { authenticated: boolean; user: { login: string } | null; error?: string }>(() => ({ authenticated: false, user: null })),
	mockRevalidateTokenIfStale: vi.fn(async () => ({ valid: true })),
}));

vi.mock('@sveltejs/kit/hooks', () => ({
	sequence:
		(...handlers: HookHandle[]) =>
		({ event, resolve }: { event: MockEvent; resolve: MockResolve }) => {
			const apply = (index: number, currentEvent: MockEvent): Promise<Response> => {
				const handler = handlers[index];
				if (!handler) {
					return resolve(currentEvent);
				}

				return handler({
					event: currentEvent,
					resolve: (nextEvent) => apply(index + 1, nextEvent),
				});
			};

			return apply(0, event);
		},
}));

vi.mock('$lib/server/session-store', () => ({
	getSessionById: mockGetSessionById,
}));

vi.mock('$lib/server/auth/guard.js', () => ({
	checkAuth: mockCheckAuth,
	revalidateTokenIfStale: mockRevalidateTokenIfStale,
}));

vi.mock('$lib/server/auth/auth-cookie.js', () => ({
	unsealAuth: vi.fn(() => null),
	parseCookieValue: vi.fn(() => undefined),
	AUTH_COOKIE_NAME: '__copilot_auth',
}));

vi.mock('$lib/server/config.js', () => ({
	config: {
		sessionSecret: 'test-secret',
		tokenMaxAge: 7 * 24 * 60 * 60 * 1000,
	},
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalBaseUrl = process.env.BASE_URL;

function setEnv(name: 'NODE_ENV' | 'BASE_URL', value?: string): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}

function setProductionEnv(): void {
	setEnv('NODE_ENV', 'production');
	setEnv('BASE_URL', 'http://localhost:3000');
}

function createEvent({
	method = 'GET',
	url = 'http://localhost/',
	headers = {},
	ip = '127.0.0.1',
}: {
	method?: string;
	url?: string;
	headers?: HeadersInit;
	ip?: string;
} = {}): MockEvent {
	const requestUrl = new URL(url);

	return {
		request: new Request(requestUrl, {
			method,
			headers: new Headers(headers),
		}),
		url: requestUrl,
		locals: {},
		cookies: {
			delete: vi.fn(),
		},
		getClientAddress: () => ip,
	};
}

function createResolve(status = 200, body = 'OK'): MockResolve {
	return vi.fn(async (_event: MockEvent) => new Response(body, { status }));
}

async function loadHandle(): Promise<HookHandle> {
	vi.resetModules();
	const hooksModule = await import('./hooks.server');
	return hooksModule.handle as unknown as HookHandle;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
	mockGetSessionById.mockReset();
	mockCheckAuth.mockReset().mockReturnValue({ authenticated: false, user: null });
	mockRevalidateTokenIfStale.mockReset().mockResolvedValue({ valid: true });
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
	setEnv('NODE_ENV');
	setEnv('BASE_URL');
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	setEnv('NODE_ENV', originalNodeEnv);
	setEnv('BASE_URL', originalBaseUrl);
});

describe('handle', () => {
	it('passes normal requests through to resolve', async () => {
		const handle = await loadHandle();
		const event = createEvent();
		const resolve = createResolve();

		const response = await handle({ event, resolve });

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('OK');
		expect(resolve).toHaveBeenCalledTimes(1);
		expect(resolve).toHaveBeenCalledWith(event);
	});

	describe('session bridge', () => {
		it('sets locals.session when x-session-id is present and resolves to a session', async () => {
			const session = { githubToken: 'token', githubUser: { login: 'octocat' } };
			mockGetSessionById.mockReturnValue(session);
			const handle = await loadHandle();
			const event = createEvent({ headers: { 'x-session-id': 'session-123' } });

			await handle({ event, resolve: createResolve() });

			expect(mockGetSessionById).toHaveBeenCalledWith('session-123');
			expect(event.locals.session).toBe(session);
		});

		it('sets locals.session to null when x-session-id is missing', async () => {
			const handle = await loadHandle();
			const event = createEvent();

			await handle({ event, resolve: createResolve() });

			expect(mockGetSessionById).not.toHaveBeenCalled();
			expect(event.locals.session).toBeNull();
		});

		it('sets locals.session to null when x-session-id does not resolve to a session', async () => {
			mockGetSessionById.mockReturnValue(undefined);
			const handle = await loadHandle();
			const event = createEvent({ headers: { 'x-session-id': 'missing-session' } });

			await handle({ event, resolve: createResolve() });

			expect(mockGetSessionById).toHaveBeenCalledWith('missing-session');
			expect(event.locals.session).toBeNull();
		});
	});

	describe('content security policy', () => {
		it('adds the Content-Security-Policy header in production', async () => {
			setProductionEnv();
			const handle = await loadHandle();

			const response = await handle({ event: createEvent(), resolve: createResolve() });

			expect(response.headers.has('Content-Security-Policy')).toBe(true);
		});

		it('allows self for default-src and unsafe-inline for style-src', async () => {
			setProductionEnv();
			const handle = await loadHandle();

			const response = await handle({ event: createEvent(), resolve: createResolve() });
			const csp = response.headers.get('Content-Security-Policy');

			expect(csp).toContain("default-src 'self'");
			expect(csp).toContain("style-src 'self' 'unsafe-inline'");
		});

		it('allows websocket connections and GitHub avatars in production CSP', async () => {
			setProductionEnv();
			const handle = await loadHandle();

			const response = await handle({ event: createEvent(), resolve: createResolve() });
			const csp = response.headers.get('Content-Security-Policy');

			expect(csp).toContain("connect-src 'self' ws: wss:");
			expect(csp).toContain("img-src 'self' data: blob: https://avatars.githubusercontent.com");
		});

		it('skips strict CSP in development while still applying always-on security headers', async () => {
			setEnv('NODE_ENV', 'development');
			const handle = await loadHandle();

			const response = await handle({ event: createEvent(), resolve: createResolve() });

			expect(response.headers.get('Content-Security-Policy')).toBeNull();
			expect(response.headers.get('Strict-Transport-Security')).toBeNull();
			expect(response.headers.get('X-Frame-Options')).toBe('DENY');
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
			expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		});
	});

	describe('csrf protection', () => {
		it('allows state-changing requests with a matching origin in production', async () => {
			setProductionEnv();
			const handle = await loadHandle();
			const resolve = createResolve(201, 'Created');

			const response = await handle({
				event: createEvent({
					method: 'POST',
					headers: { origin: 'http://localhost:3000' },
				}),
				resolve,
			});

			expect(response.status).toBe(201);
			expect(await response.text()).toBe('Created');
			expect(resolve).toHaveBeenCalledTimes(1);
		});

		it('rejects state-changing requests without an origin header in production', async () => {
			setProductionEnv();
			const handle = await loadHandle();
			const resolve = createResolve();

			const response = await handle({
				event: createEvent({ method: 'POST' }),
				resolve,
			});

			expect(response.status).toBe(403);
			expect(await response.text()).toBe('Forbidden');
			expect(resolve).not.toHaveBeenCalled();
		});

		it('exempts /api/sessions/sync from missing-origin rejection', async () => {
			setProductionEnv();
			const handle = await loadHandle();
			const resolve = createResolve(200, 'Synced');

			const response = await handle({
				event: createEvent({
					method: 'POST',
					url: 'http://localhost:3000/api/sessions/sync',
				}),
				resolve,
			});

			expect(response.status).toBe(200);
			expect(await response.text()).toBe('Synced');
			expect(resolve).toHaveBeenCalledTimes(1);
		});

		it('returns 403 for state-changing requests from a different origin in production', async () => {
			setProductionEnv();
			const handle = await loadHandle();
			const resolve = createResolve();

			const response = await handle({
				event: createEvent({
					method: 'DELETE',
					headers: { origin: 'https://evil.example' },
				}),
				resolve,
			});

			expect(response.status).toBe(403);
			expect(await response.text()).toBe('Forbidden');
			expect(resolve).not.toHaveBeenCalled();
		});

		it('skips origin validation for state-changing requests in development', async () => {
			setEnv('NODE_ENV', 'development');
			const handle = await loadHandle();
			const resolve = createResolve();

			const response = await handle({
				event: createEvent({
					method: 'PATCH',
					headers: { origin: 'https://evil.example' },
				}),
				resolve,
			});

			expect(response.status).toBe(200);
			expect(resolve).toHaveBeenCalledTimes(1);
		});
	});

	describe('rate limiting', () => {
		it('allows requests under the per-IP threshold', async () => {
			const handle = await loadHandle();
			const resolve = createResolve();

			for (let index = 0; index < 200; index += 1) {
				const response = await handle({
					event: createEvent({ ip: '192.0.2.1' }),
					resolve,
				});
				expect(response.status).toBe(200);
			}

			expect(resolve).toHaveBeenCalledTimes(200);
		});

		it('returns 429 after exceeding the threshold for one IP', async () => {
			setProductionEnv();
			const handle = await loadHandle();
			const resolve = createResolve();

			for (let index = 0; index < 200; index += 1) {
				await handle({
					event: createEvent({ ip: '198.51.100.10' }),
					resolve,
				});
			}

			const response = await handle({
				event: createEvent({ ip: '198.51.100.10' }),
				resolve,
			});

			expect(response.status).toBe(429);
			expect(await response.text()).toBe('Too Many Requests');
			expect(response.headers.get('Retry-After')).toBe('900');
			expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
		});

		it('tracks different IP addresses independently', async () => {
			const handle = await loadHandle();
			const resolve = createResolve();

			for (let index = 0; index < 201; index += 1) {
				await handle({
					event: createEvent({ ip: '203.0.113.10' }),
					resolve,
				});
			}

			const response = await handle({
				event: createEvent({ ip: '203.0.113.11' }),
				resolve,
			});

			expect(response.status).toBe(200);
		});

		it('resets the rate limit after the window expires', async () => {
			const handle = await loadHandle();
			const resolve = createResolve();
			const ip = '203.0.113.25';

			for (let index = 0; index < 200; index += 1) {
				await handle({ event: createEvent({ ip }), resolve });
			}

			const limitedResponse = await handle({ event: createEvent({ ip }), resolve });
			expect(limitedResponse.status).toBe(429);

			vi.advanceTimersByTime(15 * 60 * 1000 + 1);

			const resetResponse = await handle({ event: createEvent({ ip }), resolve });
			expect(resetResponse.status).toBe(200);
		});
	});

	describe('token revalidation', () => {
		it('returns 401 when revalidation reports an invalid token', async () => {
			const session = { githubToken: 'revoked-token', githubUser: { login: 'octocat' } };
			mockGetSessionById.mockReturnValue(session);
			mockCheckAuth.mockReturnValue({ authenticated: true, user: { login: 'octocat' } });
			mockRevalidateTokenIfStale.mockResolvedValue({ valid: false });

			const handle = await loadHandle();
			const resolve = createResolve();
			const event = createEvent({
				url: 'http://localhost/api/models',
				headers: { 'x-session-id': 'session-123' },
			});

			const response = await handle({ event, resolve });

			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.error).toContain('Token revoked');
			expect(resolve).not.toHaveBeenCalled();
		});

		it('passes through when revalidation reports a valid token', async () => {
			const session = { githubToken: 'good-token', githubUser: { login: 'octocat' } };
			mockGetSessionById.mockReturnValue(session);
			mockCheckAuth.mockReturnValue({ authenticated: true, user: { login: 'octocat' } });
			mockRevalidateTokenIfStale.mockResolvedValue({ valid: true });

			const handle = await loadHandle();
			const resolve = createResolve();
			const event = createEvent({
				url: 'http://localhost/api/models',
				headers: { 'x-session-id': 'session-123' },
			});

			const response = await handle({ event, resolve });

			expect(response.status).toBe(200);
			expect(resolve).toHaveBeenCalledTimes(1);
		});

		it('skips revalidation for auth routes', async () => {
			const session = { githubToken: 'token', githubUser: { login: 'octocat' } };
			mockGetSessionById.mockReturnValue(session);
			mockCheckAuth.mockReturnValue({ authenticated: true, user: { login: 'octocat' } });

			const handle = await loadHandle();
			const resolve = createResolve();
			const event = createEvent({
				url: 'http://localhost/auth/device/start',
				headers: { 'x-session-id': 'session-123' },
			});

			const response = await handle({ event, resolve });

			expect(response.status).toBe(200);
			expect(mockRevalidateTokenIfStale).not.toHaveBeenCalled();
		});

		it('skips revalidation when there is no session', async () => {
			const handle = await loadHandle();
			const resolve = createResolve();
			const event = createEvent({ url: 'http://localhost/api/models' });

			const response = await handle({ event, resolve });

			expect(response.status).toBe(200);
			expect(mockRevalidateTokenIfStale).not.toHaveBeenCalled();
		});

		it('skips revalidation when checkAuth reports unauthenticated', async () => {
			const session = { githubToken: 'token', githubUser: { login: 'octocat' } };
			mockGetSessionById.mockReturnValue(session);
			mockCheckAuth.mockReturnValue({ authenticated: false, user: null, error: 'expired' });

			const handle = await loadHandle();
			const resolve = createResolve();
			const event = createEvent({
				url: 'http://localhost/api/models',
				headers: { 'x-session-id': 'session-123' },
			});

			const response = await handle({ event, resolve });

			expect(response.status).toBe(200);
			expect(mockRevalidateTokenIfStale).not.toHaveBeenCalled();
		});
	});
});
