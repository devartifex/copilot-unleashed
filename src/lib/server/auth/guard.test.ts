import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig, logSecurityMock, mockValidateGitHubToken, mockClearAuth } = vi.hoisted(() => ({
	mockConfig: {
		tokenMaxAge: 60_000,
		allowedUsers: [] as string[],
	},
	logSecurityMock: vi.fn(),
	mockValidateGitHubToken: vi.fn(),
	mockClearAuth: vi.fn(),
}));

vi.mock('../config.js', () => ({
	config: mockConfig,
}));

vi.mock('../security-log.js', () => ({
	logSecurity: logSecurityMock,
}));

vi.mock('./github.js', () => ({
	validateGitHubToken: mockValidateGitHubToken,
}));

vi.mock('./session-utils.js', () => ({
	clearAuth: mockClearAuth,
}));

import { checkAuth, revalidateTokenIfStale, type GitHubUser, type SessionData } from './guard.js';

function createUser(login = 'octocat', name = 'Octo Cat'): GitHubUser {
	return { login, name };
}

function createSession(overrides: Partial<SessionData> = {}): SessionData {
	return {
		save: vi.fn((callback: (err?: Error) => void) => callback()),
		destroy: vi.fn((callback: (err?: Error) => void) => callback()),
		...overrides,
	};
}

describe('checkAuth', () => {
	beforeEach(() => {
		mockConfig.tokenMaxAge = 60_000;
		mockConfig.allowedUsers = [];
		logSecurityMock.mockReset();
		mockValidateGitHubToken.mockReset();
		mockClearAuth.mockReset().mockResolvedValue(undefined);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns success for a valid session with a token', () => {
		const user = createUser();
		const session = createSession({
			githubToken: 'token-123',
			githubUser: user,
			githubAuthTime: Date.now() - 1_000,
		});

		expect(checkAuth(session)).toEqual({
			authenticated: true,
			user,
		});
	});

	it('returns failure when the session is missing', () => {
		expect(checkAuth(null)).toEqual({
			authenticated: false,
			user: null,
			error: 'GitHub authentication required',
		});
	});

	it('returns failure when the token is missing from the session', () => {
		const session = createSession({
			githubUser: createUser(),
			githubAuthTime: Date.now(),
		});

		expect(checkAuth(session)).toEqual({
			authenticated: false,
			user: null,
			error: 'GitHub authentication required',
		});
	});

	it('returns failure and logs when the token is expired', () => {
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser('stale-user'),
			githubAuthTime: Date.now() - mockConfig.tokenMaxAge - 1,
		});

		expect(checkAuth(session)).toEqual({
			authenticated: false,
			user: null,
			error: 'Session expired. Please sign in again.',
		});
		expect(logSecurityMock).toHaveBeenCalledWith('info', 'token_expired', {
			user: 'stale-user',
			reason: 'max_age_exceeded',
		});
	});

	it('returns success when the token is still within the max age', () => {
		const user = createUser('fresh-user');
		const session = createSession({
			githubToken: 'token-123',
			githubUser: user,
			githubAuthTime: Date.now() - mockConfig.tokenMaxAge,
		});

		expect(checkAuth(session)).toEqual({
			authenticated: true,
			user,
		});
		expect(logSecurityMock).not.toHaveBeenCalled();
	});

	it('denies access when the user is not in the configured allowlist', () => {
		mockConfig.allowedUsers = ['allowed-user'];
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser('blocked-user'),
		});

		expect(checkAuth(session)).toEqual({
			authenticated: false,
			user: null,
			error: 'Your GitHub account is not authorized to use this application.',
		});
		expect(logSecurityMock).toHaveBeenCalledWith('warn', 'auth_denied_not_allowed', {
			user: 'blocked-user',
		});
	});

	it('allows access when the user is in the configured allowlist', () => {
		mockConfig.allowedUsers = ['allowed-user'];
		const user = createUser('Allowed-User');
		const session = createSession({
			githubToken: 'token-123',
			githubUser: user,
		});

		expect(checkAuth(session)).toEqual({
			authenticated: true,
			user,
		});
	});

	it('allows every authenticated user when the allowlist is empty', () => {
		mockConfig.allowedUsers = [];
		const user = createUser('any-user');
		const session = createSession({
			githubToken: 'token-123',
			githubUser: user,
		});

		expect(checkAuth(session)).toEqual({
			authenticated: true,
			user,
		});
	});

	it('returns success with a null user when only the token is present', () => {
		const session = createSession({
			githubToken: 'token-123',
		});

		expect(checkAuth(session)).toEqual({
			authenticated: true,
			user: null,
		});
	});

	it('denies access when the allowlist is configured but the session has no user', () => {
		mockConfig.allowedUsers = ['allowed-user'];
		const session = createSession({
			githubToken: 'token-123',
		});

		expect(checkAuth(session)).toEqual({
			authenticated: false,
			user: null,
			error: 'Your GitHub account is not authorized to use this application.',
		});
		expect(logSecurityMock).toHaveBeenCalledWith('warn', 'auth_denied_not_allowed', {
			user: undefined,
		});
	});

	it('treats an auth time of zero as expired when it exceeds the max age', () => {
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser('epoch-user'),
			githubAuthTime: 0,
		});

		expect(checkAuth(session)).toEqual({
			authenticated: false,
			user: null,
			error: 'Session expired. Please sign in again.',
		});
	});
});

describe('revalidateTokenIfStale', () => {
	beforeEach(() => {
		mockValidateGitHubToken.mockReset();
		mockClearAuth.mockReset().mockResolvedValue(undefined);
		logSecurityMock.mockReset();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('skips validation when the token was validated recently (within 30 minutes)', async () => {
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser(),
			githubAuthTime: Date.now() - 10 * 60 * 1000, // 10 minutes ago
		});

		const result = await revalidateTokenIfStale(session);

		expect(result).toEqual({ valid: true });
		expect(mockValidateGitHubToken).not.toHaveBeenCalled();
	});

	it('validates the token with GitHub when auth time exceeds 30 minutes', async () => {
		mockValidateGitHubToken.mockResolvedValue({
			valid: true,
			user: { login: 'octocat', name: 'Octo Cat' },
		});
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser(),
			githubAuthTime: Date.now() - 31 * 60 * 1000, // 31 minutes ago
		});

		const result = await revalidateTokenIfStale(session);

		expect(result).toEqual({ valid: true });
		expect(mockValidateGitHubToken).toHaveBeenCalledWith('token-123');
		expect(session.githubAuthTime).toBe(Date.now());
	});

	it('returns invalid and clears auth when GitHub reports a revoked token', async () => {
		mockValidateGitHubToken.mockResolvedValue({
			valid: false,
			reason: 'invalid_token',
		});
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser('revoked-user'),
			githubAuthTime: Date.now() - 31 * 60 * 1000,
		});

		const result = await revalidateTokenIfStale(session);

		expect(result).toEqual({ valid: false });
		expect(mockClearAuth).toHaveBeenCalledWith(session);
		expect(logSecurityMock).toHaveBeenCalledWith('warn', 'http_token_revoked', {
			user: 'revoked-user',
		});
	});

	it('returns valid on transient GitHub API errors (does not lock out users)', async () => {
		mockValidateGitHubToken.mockResolvedValue({
			valid: false,
			reason: 'api_error',
		});
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser(),
			githubAuthTime: Date.now() - 31 * 60 * 1000,
		});

		const result = await revalidateTokenIfStale(session);

		expect(result).toEqual({ valid: true });
		expect(mockClearAuth).not.toHaveBeenCalled();
	});

	it('validates when githubAuthTime is missing (treats as infinitely stale)', async () => {
		mockValidateGitHubToken.mockResolvedValue({
			valid: true,
			user: { login: 'octocat', name: 'Octo Cat' },
		});
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser(),
		});

		const result = await revalidateTokenIfStale(session);

		expect(result).toEqual({ valid: true });
		expect(mockValidateGitHubToken).toHaveBeenCalledWith('token-123');
	});

	it('returns invalid when the session has no token', async () => {
		const session = createSession({
			githubUser: createUser(),
			githubAuthTime: Date.now() - 31 * 60 * 1000,
		});

		const result = await revalidateTokenIfStale(session);

		expect(result).toEqual({ valid: false });
		expect(mockValidateGitHubToken).not.toHaveBeenCalled();
	});

	it('treats auth time at exactly 30 minutes as still fresh', async () => {
		const session = createSession({
			githubToken: 'token-123',
			githubUser: createUser(),
			githubAuthTime: Date.now() - 30 * 60 * 1000, // exactly 30 minutes
		});

		const result = await revalidateTokenIfStale(session);

		expect(result).toEqual({ valid: true });
		expect(mockValidateGitHubToken).not.toHaveBeenCalled();
	});
});
