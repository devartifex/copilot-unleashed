import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configMock, poolSendMock, createCopilotSessionMock, chatStateDeleteMock, chatStateSaveMock } = vi.hoisted(() => ({
  configMock: { enableRemoteSessions: true, copilotConfigDir: '/copilot-config' },
  poolSendMock: vi.fn(),
  createCopilotSessionMock: vi.fn(),
  chatStateDeleteMock: vi.fn(),
  chatStateSaveMock: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock('../../config.js', () => ({ config: configMock }));
vi.mock('../session-pool.js', () => ({ poolSend: (...args: unknown[]) => poolSendMock(...args) }));
vi.mock('../../copilot/session.js', () => ({
  createCopilotSession: (...args: unknown[]) => createCopilotSessionMock(...args),
}));
vi.mock('../../chat-state-singleton.js', () => ({
  chatStateStore: {
    delete: (...args: unknown[]) => chatStateDeleteMock(...args),
    save: (...args: unknown[]) => chatStateSaveMock(...args),
  },
}));
vi.mock('../session-events.js', () => ({
  wireSessionEvents: vi.fn(),
  createCatchAllHandler: vi.fn(() => vi.fn()),
  HANDLED_EVENT_TYPES: new Set<string>(),
}));
vi.mock('../permissions.js', () => ({
  makeUserInputHandler: vi.fn(() => vi.fn()),
  makePermissionHandler: vi.fn(() => vi.fn()),
  makeElicitationHandler: vi.fn(() => vi.fn()),
}));
vi.mock('../../skills/scanner.js', () => ({
  getSkillDirectories: vi.fn(async () => []),
}));

import { handleNewCloudSession } from './cloud-session.js';
import type { MessageContext } from '../types.js';

function makeContext(): MessageContext {
  return {
    connectionEntry: {
      client: {},
      session: null,
      userInputResolve: null,
      permissionResolves: new Map(),
      pendingUserInputPrompt: null,
      pendingPermissionPrompts: new Map(),
      sdkSessionId: null,
      model: null,
      mode: 'interactive',
    } as unknown as MessageContext['connectionEntry'],
    githubToken: 'gh-token',
    userLogin: 'octocat',
    poolKey: 'octocat:tab1',
    ws: {} as MessageContext['ws'],
  };
}

function lastPoolMessage(): Record<string, unknown> {
  return poolSendMock.mock.calls.at(-1)?.[1] as Record<string, unknown>;
}

describe('handleNewCloudSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMock.enableRemoteSessions = true;
    createCopilotSessionMock.mockResolvedValue({
      sessionId: 'cloud-session-1',
      rpc: { mode: { set: vi.fn(async () => {}) } },
    });
  });

  it('rejects when remote sessions are disabled server-side', async () => {
    configMock.enableRemoteSessions = false;

    await handleNewCloudSession({ type: 'new_cloud_session' }, makeContext());

    expect(createCopilotSessionMock).not.toHaveBeenCalled();
    expect(lastPoolMessage()).toMatchObject({ type: 'error', message: expect.stringContaining('disabled') });
  });

  it.each([
    [{ owner: '-bad-', name: 'repo' }, 'Invalid repository owner'],
    [{ owner: 'octocat', name: 'bad repo!' }, 'Invalid repository name'],
    [{ owner: 'octocat', name: 'repo', branch: '-bad' }, 'Invalid branch name'],
  ])('rejects invalid repository input %j', async (repository, expected) => {
    await handleNewCloudSession({ type: 'new_cloud_session', repository }, makeContext());

    expect(createCopilotSessionMock).not.toHaveBeenCalled();
    expect(lastPoolMessage()).toMatchObject({ type: 'error', message: expected });
  });

  it('rejects non-object repository values', async () => {
    await handleNewCloudSession({ type: 'new_cloud_session', repository: 'octocat/repo' }, makeContext());

    expect(createCopilotSessionMock).not.toHaveBeenCalled();
    expect(lastPoolMessage()).toMatchObject({ type: 'error' });
  });

  it('creates a cloud session with a validated repository', async () => {
    const ctx = makeContext();
    await handleNewCloudSession({
      type: 'new_cloud_session',
      model: 'gpt-4.1',
      mode: 'interactive',
      repository: { owner: 'octocat', name: 'hello-world', branch: 'main' },
    }, ctx);

    expect(chatStateDeleteMock).toHaveBeenCalledWith('octocat', 'tab1');
    expect(createCopilotSessionMock).toHaveBeenCalledTimes(1);
    const options = createCopilotSessionMock.mock.calls[0][2] as Record<string, unknown>;
    expect(options.cloud).toEqual({ repository: { owner: 'octocat', name: 'hello-world', branch: 'main' } });

    const created = poolSendMock.mock.calls.find((c) => (c[1] as { type: string }).type === 'cloud_session_created')?.[1];
    expect(created).toMatchObject({
      type: 'cloud_session_created',
      sessionId: 'cloud-session-1',
      repository: { owner: 'octocat', name: 'hello-world', branch: 'main' },
    });
    expect(chatStateSaveMock).toHaveBeenCalled();
  });

  it('creates a repository-less cloud session when no repository is given', async () => {
    await handleNewCloudSession({ type: 'new_cloud_session', model: 'gpt-4.1' }, makeContext());

    const options = createCopilotSessionMock.mock.calls[0][2] as Record<string, unknown>;
    expect(options.cloud).toEqual({});
  });

  it('reports an error when cloud session creation fails', async () => {
    createCopilotSessionMock.mockRejectedValue(new Error('no entitlement'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await handleNewCloudSession({ type: 'new_cloud_session' }, makeContext());

    expect(lastPoolMessage()).toMatchObject({
      type: 'error',
      message: expect.stringContaining('no entitlement'),
    });
  });
});
