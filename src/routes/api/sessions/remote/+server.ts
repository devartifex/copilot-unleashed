import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard';
import { listCloudSessions } from '$lib/server/copilot/cloud-sessions.js';

export const GET: RequestHandler = async ({ locals, url }) => {
  const auth = checkAuth(locals.session);
  if (!auth.authenticated) {
    return json({ error: auth.error }, { status: 401 });
  }

  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  const result = await listCloudSessions(locals.session!.githubToken!, {
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  if (!result.ok) {
    return json(
      { error: result.message, sessions: [] },
      { status: result.status === 401 || result.status === 403 ? result.status : 502 },
    );
  }

  return json({ sessions: result.sessions });
};
