import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  return json({ error: 'Not yet implemented' }, { status: 501 });
};
