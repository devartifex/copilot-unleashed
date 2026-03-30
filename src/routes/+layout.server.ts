import type { LayoutServerLoad } from './$types';
import { checkAuth } from '$lib/server/auth/guard';

export const load: LayoutServerLoad = async ({ locals }) => {
	const auth = checkAuth(locals.session);
	return {
		authenticated: auth.authenticated,
		user: auth.user,
	};
};
