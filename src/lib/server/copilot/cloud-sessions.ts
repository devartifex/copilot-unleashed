/**
 * Cloud-sessions REST wrapper.
 *
 * Talks to the same Copilot agents endpoint the official `copilot` CLI uses to
 * surface "remote" (cloud-published) sessions. The endpoint is not part of the
 * public REST reference, so this module degrades gracefully on 4xx/5xx and
 * exposes a typed `CloudSession` shape that the UI can render.
 */

const CLOUD_SESSIONS_URL = 'https://api.individual.githubcopilot.com/agents/sessions';
const DEFAULT_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 8000;

export interface CloudSession {
  id: string;
  name: string;
  state: string;
  repoId?: number | null;
  headRef?: string | null;
  baseRef?: string | null;
  createdAt: string;
  lastUpdatedAt: string;
  completedAt?: string | null;
  remoteSteerable: boolean;
  resourceState?: string | null;
  workflowRunId?: number | null;
  taskId?: string | null;
}

export interface CloudSessionsResult {
  ok: true;
  sessions: CloudSession[];
}

export interface CloudSessionsError {
  ok: false;
  status: number;
  message: string;
}

export interface ListCloudSessionsOptions {
  limit?: number;
  signal?: AbortSignal;
  /** Test seam — override the underlying fetch (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

function normalizeSession(raw: Record<string, unknown>): CloudSession | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : id,
    state: typeof raw.state === 'string' ? raw.state : 'unknown',
    repoId: typeof raw.repo_id === 'number' ? raw.repo_id : null,
    headRef: typeof raw.head_ref === 'string' ? raw.head_ref : null,
    baseRef: typeof raw.base_ref === 'string' ? raw.base_ref : null,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : '',
    lastUpdatedAt: typeof raw.last_updated_at === 'string' ? raw.last_updated_at : '',
    completedAt: typeof raw.completed_at === 'string' ? raw.completed_at : null,
    remoteSteerable: raw.remote_steerable === true,
    resourceState: typeof raw.resource_state === 'string' ? raw.resource_state : null,
    workflowRunId: typeof raw.workflow_run_id === 'number' ? raw.workflow_run_id : null,
    taskId: typeof raw.task_id === 'string' ? raw.task_id : null,
  };
}

export async function listCloudSessions(
  githubToken: string,
  options: ListCloudSessionsOptions = {},
): Promise<CloudSessionsResult | CloudSessionsError> {
  if (!githubToken) {
    return { ok: false, status: 401, message: 'Missing GitHub token' };
  }

  const limit = Math.max(1, Math.min(100, options.limit ?? DEFAULT_LIMIT));
  const url = `${CLOUD_SESSIONS_URL}?limit=${limit}&integration_id=copilot-developer-cli`;
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${githubToken}`,
        accept: 'application/json',
        'user-agent': 'copilot-unleashed',
      },
      redirect: 'manual',
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: `Cloud sessions endpoint returned ${res.status}`,
      };
    }

    const body = (await res.json()) as { sessions?: unknown };
    const list = Array.isArray(body.sessions) ? body.sessions : [];
    const sessions = list
      .map((s) => (s && typeof s === 'object' ? normalizeSession(s as Record<string, unknown>) : null))
      .filter((s): s is CloudSession => s !== null);

    return { ok: true, sessions };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, status: 0, message };
  } finally {
    clearTimeout(timeout);
  }
}
