import type { LayoutServerLoad } from './$types';
import { checkAuth } from '$lib/server/auth/guard';
import { config } from '$lib/server/config';
import { debug } from '$lib/server/logger';

export const load: LayoutServerLoad = async ({ locals }) => {
	debug(`[LAYOUT-LOAD] locals.session exists=${!!locals.session} hasToken=${!!locals.session?.githubToken} user=${locals.session?.githubUser?.login ?? 'none'}`);
	const auth = checkAuth(locals.session);
	debug(`[LAYOUT-LOAD] checkAuth result: authenticated=${auth.authenticated} user=${auth.user?.login ?? 'none'} error=${auth.error ?? 'none'}`);
	return {
		authenticated: auth.authenticated,
		user: auth.user,
		byokEnabled: config.byokEnabled,
	};
};
