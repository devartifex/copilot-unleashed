import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard.js';
import { subscriptionStore } from '$lib/server/push-singleton.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = checkAuth(locals.session);
	if (!auth.authenticated) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	if (!body.endpoint) {
		return json({ error: 'Endpoint required' }, { status: 400 });
	}

	const userId = locals.session?.githubUser?.login;
	if (!userId) {
		return json({ error: 'User not found' }, { status: 401 });
	}

	await subscriptionStore.delete(userId, body.endpoint);
	return json({ ok: true });
};
