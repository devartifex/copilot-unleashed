import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configMock, poolSendMock } = vi.hoisted(() => ({
  configMock: { enableRemoteSessions: true },
  poolSendMock: vi.fn(),
}));

vi.mock('../../config.js', () => ({ config: configMock }));
vi.mock('../session-pool.js', () => ({ poolSend: (...args: unknown[]) => poolSendMock(...args) }));
vi.mock('../../logger.js', () => ({ debug: vi.fn() }));

import { handleRemoteToggle } from './remote.js';
import type { MessageContext } from '../types.js';

function makeContext(session: unknown): MessageContext {
  return {
    connectionEntry: { session } as unknown as MessageContext['connectionEntry'],
    githubToken: 'gh-token',
    userLogin: 'octocat',
    poolKey: 'octocat:tab1',
    ws: {} as MessageContext['ws'],
  };
}

function sentMessages(): Array<Record<string, unknown>> {
  return poolSendMock.mock.calls.map((c) => c[1] as Record<string, unknown>);
}

describe('handleRemoteToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMock.enableRemoteSessions = true;
  });

  it('rejects when remote sessions are disabled server-side', async () => {
    configMock.enableRemoteSessions = false;

    await handleRemoteToggle({ type: 'remote_toggle', mode: 'on' }, makeContext({}));

    expect(sentMessages()[0]).toMatchObject({ type: 'error', message: expect.stringContaining('disabled') });
  });

  it('errors when there is no active session', async () => {
    await handleRemoteToggle({ type: 'remote_toggle', mode: 'on' }, makeContext(null));

    expect(sentMessages()[0]).toMatchObject({ type: 'error', message: 'No active session' });
  });

  it('disables remote and replies remote_toggled enabled:false', async () => {
    const disable = vi.fn(async () => {});
    const session = { rpc: { remote: { disable, enable: vi.fn() } } };

    await handleRemoteToggle({ type: 'remote_toggle', mode: 'off' }, makeContext(session));

    expect(disable).toHaveBeenCalledTimes(1);
    expect(sentMessages()).toEqual([{ type: 'remote_toggled', enabled: false }]);
  });

  it('enables remote and forwards the github.com URL', async () => {
    const enable = vi.fn(async () => ({ url: 'https://github.com/copilot/c/abc', remoteSteerable: true }));
    const session = { rpc: { remote: { enable, disable: vi.fn() } } };

    await handleRemoteToggle({ type: 'remote_toggle', mode: 'on' }, makeContext(session));

    expect(enable).toHaveBeenCalledWith({ mode: 'on' });
    expect(sentMessages()).toEqual([
      { type: 'remote_toggled', enabled: true },
      { type: 'remote_session_url', url: 'https://github.com/copilot/c/abc' },
    ]);
  });

  it('defaults invalid modes to "on"', async () => {
    const enable = vi.fn(async () => ({}));
    const session = { rpc: { remote: { enable, disable: vi.fn() } } };

    await handleRemoteToggle({ type: 'remote_toggle', mode: 'bogus' }, makeContext(session));

    expect(enable).toHaveBeenCalledWith({ mode: 'on' });
    expect(sentMessages()).toEqual([{ type: 'remote_toggled', enabled: true }]);
  });

  it('reports an error when the RPC fails', async () => {
    const enable = vi.fn(async () => { throw new Error('not supported'); });
    const session = { rpc: { remote: { enable, disable: vi.fn() } } };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await handleRemoteToggle({ type: 'remote_toggle', mode: 'export' }, makeContext(session));

    expect(sentMessages()[0]).toMatchObject({
      type: 'error',
      message: expect.stringContaining('not supported'),
    });
  });
});
