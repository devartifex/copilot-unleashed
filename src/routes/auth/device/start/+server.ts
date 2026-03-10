import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  // Stub — will be implemented in Phase 3
  return json({ error: 'Not yet implemented' }, { status: 501 });
};
