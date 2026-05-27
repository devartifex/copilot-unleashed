// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/guard', () => ({
  checkAuth: vi.fn(),
}));

vi.mock('$lib/server/copilot/cloud-sessions.js', () => ({
  listCloudSessions: vi.fn(),
}));

import { GET } from './+server';
import { checkAuth } from '$lib/server/auth/guard';
import { listCloudSessions } from '$lib/server/copilot/cloud-sessions.js';

function createEvent(session?: { githubToken?: string }, search = '') {
  const url = new URL(`http://localhost/api/sessions/remote${search}`);
  return {
    locals: { session },
    url,
  } as any;
}

describe('GET /api/sessions/remote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkAuth).mockReturnValue({
      authenticated: true,
      user: { login: 'octocat', name: 'Octocat' },
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(checkAuth).mockReturnValue({
      authenticated: false,
      user: null,
      error: 'GitHub authentication required',
    });
    const response = await GET(createEvent());
    expect(response.status).toBe(401);
    expect(listCloudSessions).not.toHaveBeenCalled();
  });

  it('returns sessions on success', async () => {
    vi.mocked(listCloudSessions).mockResolvedValue({
      ok: true,
      sessions: [
        {
          id: 's1',
          name: 'demo',
          state: 'completed',
          createdAt: '',
          lastUpdatedAt: '',
          remoteSteerable: false,
        },
      ],
    } as never);

    const response = await GET(createEvent({ githubToken: 'tok' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe('s1');
  });

  it('forwards a limit query param to listCloudSessions', async () => {
    vi.mocked(listCloudSessions).mockResolvedValue({ ok: true, sessions: [] } as never);
    await GET(createEvent({ githubToken: 'tok' }, '?limit=5'));
    expect(listCloudSessions).toHaveBeenCalledWith('tok', { limit: 5 });
  });

  it('returns 502 when the upstream endpoint fails with a generic error', async () => {
    vi.mocked(listCloudSessions).mockResolvedValue({
      ok: false,
      status: 500,
      message: 'upstream down',
    } as never);
    const response = await GET(createEvent({ githubToken: 'tok' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream down', sessions: [] });
  });

  it('passes through 401/403 statuses from upstream', async () => {
    vi.mocked(listCloudSessions).mockResolvedValue({
      ok: false,
      status: 403,
      message: 'forbidden',
    } as never);
    const response = await GET(createEvent({ githubToken: 'tok' }));
    expect(response.status).toBe(403);
  });
});
