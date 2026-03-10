import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard';
import { createCopilotClient } from '$lib/server/copilot/client';
import { getAvailableModels } from '$lib/server/copilot/session';

export const GET: RequestHandler = async ({ locals }) => {
	const auth = checkAuth(locals.session ?? undefined);
	if (!auth.authenticated) {
		return json({ error: auth.error }, { status: 401 });
	}

	try {
		const client = createCopilotClient(locals.session!.githubToken!);
		const models = await getAvailableModels(client);
		const modelArray = Array.isArray(models) ? models : [];
		await client.stop();
		return json({ models: modelArray });
	} catch (err: any) {
		console.error('Models error:', err.message);
		return json({ error: 'Failed to list models', models: [] }, { status: 500 });
	}
};
