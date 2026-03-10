import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { config } from '$lib/server/config';
import { logSecurity } from '$lib/server/security-log';

export const GET: RequestHandler = async ({ locals }) => {
	const session = locals.session;

	if (session?.githubToken) {
		const authTime = session.githubAuthTime;
		if (authTime && Date.now() - authTime > config.tokenMaxAge) {
			logSecurity('info', 'status_check_expired', {
				user: session.githubUser?.login,
			});
			await new Promise<void>((resolve) => session.destroy(() => resolve()));
			return json({ authenticated: false, githubUser: null });
		}
	}

	return json({
		authenticated: !!session?.githubToken,
		githubUser: session?.githubUser?.login || null,
	});
};
