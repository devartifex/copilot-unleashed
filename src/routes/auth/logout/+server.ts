import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearAuth } from '$lib/server/auth/session-utils';
import { cleanupUserSessions } from '$lib/server/ws/session-pool';

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.session) {
		const username = locals.session.githubUser?.login;
		await clearAuth(locals.session);
		if (username) {
			await cleanupUserSessions(username);
		}
	}
	return json({ success: true });
};
