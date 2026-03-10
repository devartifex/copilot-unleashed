import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.session?.githubToken) {
		return {
			authenticated: true,
			user: locals.session.githubUser || null,
		};
	}
	return { authenticated: false, user: null };
};
