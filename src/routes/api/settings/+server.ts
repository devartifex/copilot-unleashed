import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard';
import { loadUserSettings, saveUserSettings } from '$lib/server/settings-store';

export const GET: RequestHandler = async ({ locals }) => {
	const auth = checkAuth(locals.session);
	if (!auth.authenticated || !auth.user?.login) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	try {
		const settings = await loadUserSettings(auth.user.login);
		if (!settings) {
			return json({ settings: null });
		}
		return json({ settings });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('Settings load error:', message);
		return json({ error: 'Failed to load settings' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const auth = checkAuth(locals.session);
	if (!auth.authenticated || !auth.user?.login) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	try {
		const body = await request.json() as { settings?: Record<string, unknown> };
		if (!body.settings || typeof body.settings !== 'object') {
			return json({ error: 'Missing settings object' }, { status: 400 });
		}

		const raw = body.settings;

		// Backward compat: map legacy field name to new one
		if ('customInstructions' in raw && !('additionalInstructions' in raw)) {
			raw.additionalInstructions = raw.customInstructions ?? '';
		}
		delete raw.customInstructions;
		// Strip removed fields from old clients
		delete raw.customAgents;
		delete raw.disabledSkills;

		await saveUserSettings(auth.user.login, raw as unknown as Parameters<typeof saveUserSettings>[1]);
		return json({ ok: true });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('Settings save error:', message);
		return json({ error: 'Failed to save settings' }, { status: 500 });
	}
};
