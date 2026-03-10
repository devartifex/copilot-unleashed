import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.session) {
		await new Promise<void>((resolve) => locals.session!.destroy(() => resolve()));
	}
	return json({ success: true });
};
