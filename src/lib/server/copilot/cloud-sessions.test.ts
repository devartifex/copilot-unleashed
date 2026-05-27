import { describe, it, expect, vi } from 'vitest';
import { listCloudSessions } from './cloud-sessions.js';

function makeFetch(response: Partial<Response> & { jsonValue?: unknown }): typeof fetch {
  return vi.fn(async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonValue ?? { sessions: [] },
  })) as unknown as typeof fetch;
}

describe('listCloudSessions', () => {
  it('returns 401 error when token is missing', async () => {
    const result = await listCloudSessions('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('GETs the agents endpoint with bearer auth and integration_id', async () => {
    const fetchImpl = makeFetch({ jsonValue: { sessions: [] } });
    await listCloudSessions('abc123', { fetchImpl, limit: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('https://api.individual.githubcopilot.com/agents/sessions');
    expect(url).toContain('limit=5');
    expect(url).toContain('integration_id=copilot-developer-cli');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).redirect).toBe('manual');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer abc123');
  });

  it('clamps limit to the 1..100 range', async () => {
    const fetchImpl = makeFetch({ jsonValue: { sessions: [] } });
    await listCloudSessions('abc', { fetchImpl, limit: 9999 });
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('limit=100');
  });

  it('normalizes valid sessions and drops invalid ones', async () => {
    const fetchImpl = makeFetch({
      jsonValue: {
        sessions: [
          {
            id: 's1',
            name: 'fix login bug',
            state: 'in_progress',
            repo_id: 42,
            head_ref: 'feature/login',
            base_ref: 'main',
            created_at: '2025-01-01T00:00:00Z',
            last_updated_at: '2025-01-01T01:00:00Z',
            completed_at: null,
            remote_steerable: true,
            resource_state: 'running',
            workflow_run_id: 1234,
            task_id: 't-1',
          },
          { name: 'no id, should be skipped' },
          'garbage',
        ],
      },
    });
    const result = await listCloudSessions('abc', { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      id: 's1',
      name: 'fix login bug',
      state: 'in_progress',
      repoId: 42,
      headRef: 'feature/login',
      remoteSteerable: true,
    });
  });

  it('returns a structured error on non-2xx responses', async () => {
    const fetchImpl = makeFetch({ ok: false, status: 403 });
    const result = await listCloudSessions('abc', { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('returns a structured error when fetch throws', async () => {
    const fetchImpl = (vi.fn(async () => {
      throw new Error('network down');
    }) as unknown) as typeof fetch;
    const result = await listCloudSessions('abc', { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.message).toContain('network down');
    }
  });
});
