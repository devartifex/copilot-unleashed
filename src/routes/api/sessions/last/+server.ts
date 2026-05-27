import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAuth } from '$lib/server/auth/guard';
import { createCopilotClient } from '$lib/server/copilot/client';

/**
 * GET /api/sessions/last — returns metadata for the most recent local session
 * so the UI can offer a one-tap "Resume last conversation" across devices.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const auth = checkAuth(locals.session);
  if (!auth.authenticated) {
    return json({ error: auth.error }, { status: 401 });
  }

  const client = createCopilotClient(locals.session!.githubToken!);
  try {
    const lastId = await client.getLastSessionId();
    if (!lastId) {
      return json({ error: 'No previous session found' }, { status: 404 });
    }
    const metadata = await client.getSessionMetadata(lastId);
    if (!metadata) {
      return json({ error: 'Session metadata unavailable' }, { status: 404 });
    }
    return json({ sessionId: lastId, metadata });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/sessions/last]', message);
    return json({ error: 'Failed to load last session' }, { status: 500 });
  } finally {
    try { await client.stop(); } catch { /* ignore */ }
  }
};
