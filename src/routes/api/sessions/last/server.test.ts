// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/guard', () => ({
  checkAuth: vi.fn(),
}));

vi.mock('$lib/server/copilot/client', () => ({
  createCopilotClient: vi.fn(),
}));

import { GET } from './+server';
import { checkAuth } from '$lib/server/auth/guard';
import { createCopilotClient } from '$lib/server/copilot/client';

function createEvent(session?: { githubToken?: string }) {
  return { locals: { session } } as any;
}

describe('GET /api/sessions/last', () => {
  const stop = vi.fn(async () => undefined);
  const getLastSessionId = vi.fn();
  const getSessionMetadata = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(checkAuth).mockReturnValue({
      authenticated: true,
      user: { login: 'octocat', name: 'Octocat' },
    });
    vi.mocked(createCopilotClient).mockReturnValue({
      stop,
      getLastSessionId,
      getSessionMetadata,
    } as never);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(checkAuth).mockReturnValue({
      authenticated: false,
      user: null,
      error: 'unauth',
    });
    const res = await GET(createEvent());
    expect(res.status).toBe(401);
    expect(createCopilotClient).not.toHaveBeenCalled();
  });

  it('returns 404 when no previous session exists', async () => {
    getLastSessionId.mockResolvedValue(undefined);
    const res = await GET(createEvent({ githubToken: 'tok' }));
    expect(res.status).toBe(404);
    expect(stop).toHaveBeenCalled();
  });

  it('returns 404 when metadata is unavailable', async () => {
    getLastSessionId.mockResolvedValue('sess-1');
    getSessionMetadata.mockResolvedValue(undefined);
    const res = await GET(createEvent({ githubToken: 'tok' }));
    expect(res.status).toBe(404);
  });

  it('returns sessionId + metadata on success', async () => {
    getLastSessionId.mockResolvedValue('sess-1');
    getSessionMetadata.mockResolvedValue({ id: 'sess-1', title: 'demo' });
    const res = await GET(createEvent({ githubToken: 'tok' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sessionId: 'sess-1',
      metadata: { id: 'sess-1', title: 'demo' },
    });
  });

  it('returns 500 on unexpected SDK errors', async () => {
    getLastSessionId.mockRejectedValue(new Error('boom'));
    const res = await GET(createEvent({ githubToken: 'tok' }));
    expect(res.status).toBe(500);
    expect(stop).toHaveBeenCalled();
  });
});
