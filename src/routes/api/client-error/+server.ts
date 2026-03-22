import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard.js';
import { logSecurity } from '$lib/server/security-log';

export const POST: RequestHandler = async ({ locals, request }) => {
	const auth = checkAuth(locals.session);
	if (!auth.authenticated) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { message, source, lineno, colno, stack, type } = body ?? {};
		logSecurity('warn', 'browser_error', {
			type: String(type || 'error').slice(0, 50),
			message: String(message || '').slice(0, 500),
			source: String(source || '').slice(0, 200),
			lineno: Number(lineno) || 0,
			colno: Number(colno) || 0,
			stack: String(stack || '').slice(0, 2000),
		});
	} catch {
		// Ignore malformed request bodies
	}
	return new Response(null, { status: 204 });
};
