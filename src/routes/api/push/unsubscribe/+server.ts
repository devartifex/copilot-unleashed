import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard.js';
import { subscriptionStore } from '$lib/server/push-singleton.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = checkAuth(locals.session);
	if (!auth.authenticated) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const bodyObj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
	const endpoint = typeof bodyObj?.endpoint === 'string' ? bodyObj.endpoint : null;
	if (!endpoint) {
		return json({ error: 'Endpoint required' }, { status: 400 });
	}

	const userId = locals.session?.githubUser?.login;
	if (!userId) {
		return json({ error: 'User not found' }, { status: 401 });
	}

	await subscriptionStore.delete(userId, endpoint);
	return json({ ok: true });
};
