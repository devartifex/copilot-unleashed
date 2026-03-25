import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard.js';
import { config } from '$lib/server/config.js';

export const GET: RequestHandler = async ({ locals }) => {
	const auth = checkAuth(locals.session);
	if (!auth.authenticated) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!config.vapid.publicKey) {
		return json({ error: 'Push notifications not configured' }, { status: 503 });
	}

	return json({ publicKey: config.vapid.publicKey });
};
