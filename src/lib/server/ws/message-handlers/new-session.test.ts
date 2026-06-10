import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configMock, poolSendMock, createCopilotSessionMock, chatStateDeleteMock, chatStateSaveMock } = vi.hoisted(() => ({
  configMock: {
    enableRemoteSessions: true,
    copilotConfigDir: '/copilot-config',
    byokEnabled: false,
  },
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
vi.mock('../../byok/provider-store.js', () => ({
  loadProviderConfig: vi.fn(async () => null),
}));

import { handleNewSession } from './new-session.js';
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

function sentMessages(): Array<Record<string, unknown>> {
  return poolSendMock.mock.calls.map((c) => c[1] as Record<string, unknown>);
}

const sdkSession = { sessionId: 'sdk-1', rpc: { mode: { set: vi.fn(async () => {}) } } };

describe('handleNewSession model fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('creates a session with the requested model', async () => {
    createCopilotSessionMock.mockResolvedValue(sdkSession);

    await handleNewSession({ type: 'new_session', model: 'claude-sonnet-4-6' }, makeContext());

    expect(createCopilotSessionMock).toHaveBeenCalledTimes(1);
    const options = createCopilotSessionMock.mock.calls[0][2] as Record<string, unknown>;
    expect(options.model).toBe('claude-sonnet-4-6');
    expect(sentMessages()).toContainEqual(
      expect.objectContaining({ type: 'session_created', model: 'claude-sonnet-4-6' }),
    );
  });

  it('omits the model entirely when the client sends none', async () => {
    createCopilotSessionMock.mockResolvedValue(sdkSession);

    await handleNewSession({ type: 'new_session' }, makeContext());

    const options = createCopilotSessionMock.mock.calls[0][2] as Record<string, unknown>;
    expect(options.model).toBeUndefined();
  });

  it('retries with the SDK default when the requested model is not available', async () => {
    createCopilotSessionMock
      .mockRejectedValueOnce(new Error('Request session.create failed with message: Model "gpt-4.1" is not available.'))
      .mockResolvedValueOnce(sdkSession);

    await handleNewSession({ type: 'new_session', model: 'gpt-4.1', reasoningEffort: 'high' }, makeContext());

    expect(createCopilotSessionMock).toHaveBeenCalledTimes(2);
    const retryOptions = createCopilotSessionMock.mock.calls[1][2] as Record<string, unknown>;
    expect(retryOptions.model).toBeUndefined();
    expect(retryOptions.reasoningEffort).toBeUndefined();

    // Client is informed and session_created carries no stale model
    expect(sentMessages()).toContainEqual(
      expect.objectContaining({ type: 'info', message: expect.stringContaining('no longer available') }),
    );
    expect(sentMessages()).toContainEqual(
      expect.objectContaining({ type: 'session_created', sessionId: 'sdk-1', model: undefined }),
    );
  });

  it('still fails for non-model errors without retrying', async () => {
    createCopilotSessionMock.mockRejectedValue(new Error('network down'));

    await handleNewSession({ type: 'new_session', model: 'gpt-5' }, makeContext());

    expect(createCopilotSessionMock).toHaveBeenCalledTimes(1);
    expect(sentMessages()).toContainEqual(
      expect.objectContaining({ type: 'error', message: expect.stringContaining('network down') }),
    );
  });
});
