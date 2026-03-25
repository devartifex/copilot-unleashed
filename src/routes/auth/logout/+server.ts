import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearAuth } from '$lib/server/auth/session-utils';
import { cleanupUserSessions } from '$lib/server/ws/session-pool';
import { AUTH_COOKIE_NAME } from '$lib/server/auth/auth-cookie';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.session) {
		const username = locals.session.githubUser?.login;
		await clearAuth(locals.session);
		if (username) {
			await cleanupUserSessions(username);
		}
	}
	cookies.delete(AUTH_COOKIE_NAME, { path: '/' });
	return json({ success: true });
};
