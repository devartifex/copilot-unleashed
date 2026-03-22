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

	// Validate subscription object
	if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
		return json({ error: 'Invalid subscription' }, { status: 400 });
	}

	// Validate endpoint URL (must be HTTPS)
	try {
		const url = new URL(body.endpoint);
		if (url.protocol !== 'https:') {
			return json({ error: 'Endpoint must use HTTPS' }, { status: 400 });
		}
	} catch {
		return json({ error: 'Invalid endpoint URL' }, { status: 400 });
	}

	const userId = locals.session?.githubUser?.login;
	if (!userId) {
		return json({ error: 'User not found' }, { status: 401 });
	}

	await subscriptionStore.save(userId, {
		endpoint: body.endpoint,
		keys: {
			p256dh: body.keys.p256dh,
			auth: body.keys.auth,
		},
		userId,
		createdAt: Date.now(),
	});

	return json({ ok: true });
};
