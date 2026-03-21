// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/guard', () => ({
	checkAuth: vi.fn(),
}));

import { GET } from './+server';
import { checkAuth } from '$lib/server/auth/guard';

function createEvent(session?: Record<string, unknown>) {
	return { locals: { session } } as any;
}

describe('GET /api/version', () => {
	beforeEach(() => {
		vi.mocked(checkAuth).mockReturnValue({ authenticated: true, user: { login: 'testuser' } } as any);
	});

	it('returns 401 when not authenticated', async () => {
		vi.mocked(checkAuth).mockReturnValue({ authenticated: false } as any);
		const response = await GET(createEvent());

		expect(response.status).toBe(401);
	});

	it('returns 200', async () => {
		const response = await GET(createEvent());

		expect(response.status).toBe(200);
	});

	it('returns version info', async () => {
		const response = await GET(createEvent());
		const body = await response.json();

		expect(body).toHaveProperty('sdkVersion');
	});

	it('returns sdkVersion as a string', async () => {
		const response = await GET(createEvent());
		const body = await response.json();

		expect(typeof body.sdkVersion).toBe('string');
	});

	it('returns a stable payload across requests', async () => {
		const first = await (await GET(createEvent())).json();
		const second = await (await GET(createEvent())).json();

		expect(second).toEqual(first);
	});

	it('responds with JSON content type', async () => {
		const response = await GET(createEvent());

		expect(response.headers.get('content-type')).toContain('application/json');
	});
});
