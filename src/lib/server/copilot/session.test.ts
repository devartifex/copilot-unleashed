import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    copilotConfigDir: '/copilot-config',
  },
}));

import { createCopilotSession, getAvailableModels, buildSessionHooks, buildSessionMcpServers } from './session.js';

interface ClientMock {
  createSession: ReturnType<typeof vi.fn>;
  listModels: ReturnType<typeof vi.fn>;
}

function createClientMock(): ClientMock {
  return {
    createSession: vi.fn(async (sessionConfig: unknown) => ({ sessionConfig })),
    listModels: vi.fn(),
  };
}

function getSessionConfig(client: ClientMock): Record<string, unknown> {
  const [sessionConfig] = client.createSession.mock.calls[0] as [Record<string, unknown>];
  return sessionConfig;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createCopilotSession', () => {
  it('creates a default session config with GitHub MCP access and approve-all permissions', async () => {
    const client = createClientMock();

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token');

    expect(client.createSession).toHaveBeenCalledTimes(1);

    const sessionConfig = getSessionConfig(client);
    expect(sessionConfig).toMatchObject({
      clientName: 'copilot-unleashed',
      model: 'gpt-4.1',
      streaming: true,
      configDir: '/copilot-config',
    });

    const mcpServers = sessionConfig.mcpServers as Record<string, Record<string, unknown>>;
    expect(mcpServers.github).toEqual({
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/x/all',
      headers: {
        Authorization: 'Bearer gh-token',
      },
      tools: ['*'],
    });

    const onPermissionRequest = sessionConfig.onPermissionRequest as (
      request: unknown,
      context: unknown,
    ) => { kind: string };
    expect(onPermissionRequest({ toolName: 'bash' }, { sessionId: 's1' })).toEqual({ kind: 'approved' });
  });

  it('uses the provided prompt permission handler when prompt mode is enabled', async () => {
    const client = createClientMock();
    const onPermissionRequest = vi.fn((_request: unknown, _context: unknown) => ({ kind: 'approved' as const }));

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token', {
      permissionMode: 'prompt',
      onPermissionRequest,
    });

    const sessionConfig = getSessionConfig(client);
    const configuredHandler = sessionConfig.onPermissionRequest as typeof onPermissionRequest;

    configuredHandler({ toolName: 'write' }, { sessionId: 's2' });
    expect(onPermissionRequest).toHaveBeenCalledWith({ toolName: 'write' }, { sessionId: 's2' });
  });

  it('applies optional session settings to the SDK config', async () => {
    const client = createClientMock();
    const onUserInputRequest = vi.fn();

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token', {
      model: 'claude-sonnet-4.5',
      reasoningEffort: 'high',
      customInstructions: 'Stay concise.',
      excludedTools: ['bash'],
      availableTools: ['read'],
      onUserInputRequest,
      infiniteSessions: {
        enabled: true,
        backgroundCompactionThreshold: 0.7,
        bufferExhaustionThreshold: 0.4,
      },
      configDir: '/custom-config',
    });

    expect(getSessionConfig(client)).toMatchObject({
      model: 'claude-sonnet-4.5',
      reasoningEffort: 'high',
      excludedTools: ['bash'],
      availableTools: ['read'],
      onUserInputRequest,
      configDir: '/custom-config',
      systemMessage: {
        mode: 'append',
        content: 'Stay concise.',
      },
      infiniteSessions: {
        enabled: true,
        backgroundCompactionThreshold: 0.7,
        bufferExhaustionThreshold: 0.4,
      },
    });
  });

  it('passes skillDirectories and disabledSkills to the SDK session config', async () => {
    const client = createClientMock();

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token', {
      skillDirectories: ['/skills/git-commit', '/skills/code-review'],
      disabledSkills: ['code-review'],
    });

    const config = getSessionConfig(client);
    expect(config.skillDirectories).toEqual(['/skills/git-commit', '/skills/code-review']);
    expect(config.disabledSkills).toEqual(['code-review']);
  });

  it('omits skillDirectories and disabledSkills when empty', async () => {
    const client = createClientMock();

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token', {
      skillDirectories: [],
      disabledSkills: [],
    });

    const config = getSessionConfig(client);
    expect(config.skillDirectories).toBeUndefined();
    expect(config.disabledSkills).toBeUndefined();
  });

  it('passes custom agents to SDK session config', async () => {
    const client = createClientMock();
    const customAgents = [
      { name: 'editor', prompt: 'Edit code', tools: ['bash', 'edit'] },
      { name: 'reviewer', prompt: 'Review code', displayName: 'Code Reviewer' },
    ];

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token', {
      customAgents,
    });

    const config = getSessionConfig(client);
    expect(config.customAgents).toEqual(customAgents);
  });

  it('always includes GitHub MCP server with the provided token', async () => {
    const client = createClientMock();

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'my-gh-token-123');

    const mcpServers = getSessionConfig(client).mcpServers as Record<string, Record<string, unknown>>;
    expect(mcpServers.github).toEqual({
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/x/all',
      headers: { Authorization: 'Bearer my-gh-token-123' },
      tools: ['*'],
    });
  });

  it('merges stdio MCP servers from mcp-config.json into the session config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'copilot-mcp-test-'));
    await writeFile(join(dir, 'mcp-config.json'), JSON.stringify({
      mcpServers: {
        'awesome-copilot': {
          type: 'stdio',
          command: 'docker',
          args: ['run', '-i', '--rm', 'ghcr.io/microsoft/mcp-dotnet-samples/awesome-copilot:latest'],
        },
      },
    }));

    try {
      const mcpServers: Awaited<ReturnType<typeof buildSessionMcpServers>> =
        await buildSessionMcpServers('gh-token', dir);
      expect(mcpServers['awesome-copilot']).toEqual({
        type: 'stdio',
        command: 'docker',
        args: ['run', '-i', '--rm', 'ghcr.io/microsoft/mcp-dotnet-samples/awesome-copilot:latest'],
        tools: ['*'],
      });
      expect(mcpServers.github).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('only includes GitHub MCP server when no config file exists', async () => {
    const client = createClientMock();

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token');

    const mcpServers = getSessionConfig(client).mcpServers as Record<string, Record<string, unknown>>;
    expect(Object.keys(mcpServers)).toEqual(['github']);
  });

  it('injects OAuth token from CLI token store for HTTP MCP servers without Authorization', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'copilot-mcp-oauth-'));
    const serverUrl = 'https://agent365.svc.cloud.microsoft/agents/tenants/test/servers/mcp_MailTools';
    const hash = createHash('sha256').update(serverUrl).digest('hex');
    const oauthDir = join(dir, 'mcp-oauth-config');
    await mkdir(oauthDir, { recursive: true });

    await writeFile(join(dir, 'mcp-config.json'), JSON.stringify({
      mcpServers: {
        'm365-mail': { type: 'http', url: serverUrl, headers: {} },
      },
    }));

    await writeFile(join(oauthDir, `${hash}.tokens.json`), JSON.stringify({
      accessToken: 'test-m365-token',
      refreshToken: 'test-refresh',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scope: 'https://agent365.svc.cloud.microsoft/.default',
    }));

    try {
      const mcpServers = await buildSessionMcpServers('gh-token', dir);
      const mailServer = mcpServers['m365-mail'] as { headers?: Record<string, string> };
      expect(mailServer.headers?.Authorization).toBe('Bearer test-m365-token');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not inject OAuth token when server already has an Authorization header', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'copilot-mcp-oauth-'));
    const serverUrl = 'https://example.com/mcp';
    const hash = createHash('sha256').update(serverUrl).digest('hex');
    const oauthDir = join(dir, 'mcp-oauth-config');
    await mkdir(oauthDir, { recursive: true });

    await writeFile(join(dir, 'mcp-config.json'), JSON.stringify({
      mcpServers: {
        'custom-server': { type: 'http', url: serverUrl, headers: { Authorization: 'Bearer static-token' } },
      },
    }));

    await writeFile(join(oauthDir, `${hash}.tokens.json`), JSON.stringify({
      accessToken: 'should-not-be-used',
      refreshToken: 'r',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scope: 'test',
    }));

    try {
      const mcpServers = await buildSessionMcpServers('gh-token', dir);
      const server = mcpServers['custom-server'] as { headers?: Record<string, string> };
      expect(server.headers?.Authorization).toBe('Bearer static-token');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('warns and skips injection when OAuth token is expired', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'copilot-mcp-oauth-'));
    const serverUrl = 'https://agent365.svc.cloud.microsoft/agents/tenants/test/servers/mcp_CalendarTools';
    const hash = createHash('sha256').update(serverUrl).digest('hex');
    const oauthDir = join(dir, 'mcp-oauth-config');
    await mkdir(oauthDir, { recursive: true });

    await writeFile(join(dir, 'mcp-config.json'), JSON.stringify({
      mcpServers: {
        'm365-calendar': { type: 'http', url: serverUrl, headers: {} },
      },
    }));

    // Expired token with no config file for refresh
    await writeFile(join(oauthDir, `${hash}.tokens.json`), JSON.stringify({
      accessToken: 'expired-token',
      refreshToken: 'r',
      expiresAt: Math.floor(Date.now() / 1000) - 60,
      scope: 'test',
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const mcpServers = await buildSessionMcpServers('gh-token', dir);
      const server = mcpServers['m365-calendar'] as { headers?: Record<string, string> };
      expect(server.headers?.Authorization).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('expired'),
      );
    } finally {
      warnSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refreshes an expired OAuth token using the refresh_token grant', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'copilot-mcp-oauth-'));
    const serverUrl = 'https://agent365.svc.cloud.microsoft/agents/tenants/test/servers/mcp_MailTools';
    const hash = createHash('sha256').update(serverUrl).digest('hex');
    const oauthDir = join(dir, 'mcp-oauth-config');
    await mkdir(oauthDir, { recursive: true });

    await writeFile(join(dir, 'mcp-config.json'), JSON.stringify({
      mcpServers: {
        'm365-mail': { type: 'http', url: serverUrl, headers: {} },
      },
    }));

    // Expired token
    await writeFile(join(oauthDir, `${hash}.tokens.json`), JSON.stringify({
      accessToken: 'expired-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 60,
      scope: 'https://agent365.svc.cloud.microsoft/.default',
    }));

    // OAuth config with authorization server details
    await writeFile(join(oauthDir, `${hash}.json`), JSON.stringify({
      serverUrl,
      authorizationServerUrl: 'https://login.microsoftonline.com/organizations/v2.0',
      clientId: 'test-client-id',
      redirectUri: 'http://127.0.0.1:12345/',
      resourceUrl: serverUrl,
      issuedAt: 0,
      isStatic: false,
    }));

    // Mock the token endpoint response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'fresh-access-token',
        refresh_token: 'fresh-refresh-token',
        expires_in: 3600,
        scope: 'https://agent365.svc.cloud.microsoft/.default',
      }),
    });

    try {
      const mcpServers = await buildSessionMcpServers('gh-token', dir);
      const server = mcpServers['m365-mail'] as { headers?: Record<string, string> };
      expect(server.headers?.Authorization).toBe('Bearer fresh-access-token');

      // Verify fetch was called with correct params
      expect(fetchMock).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
        expect.objectContaining({ method: 'POST' }),
      );

      // Verify tokens were written back to disk
      const { readFile: rf } = await import('node:fs/promises');
      const updated = JSON.parse(await rf(join(oauthDir, `${hash}.tokens.json`), 'utf8'));
      expect(updated.accessToken).toBe('fresh-access-token');
      expect(updated.refreshToken).toBe('fresh-refresh-token');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('gracefully handles missing OAuth token files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'copilot-mcp-oauth-'));

    await writeFile(join(dir, 'mcp-config.json'), JSON.stringify({
      mcpServers: {
        'm365-teams': {
          type: 'http',
          url: 'https://agent365.svc.cloud.microsoft/agents/tenants/test/servers/mcp_TeamsServer',
          headers: {},
        },
      },
    }));

    try {
      const mcpServers = await buildSessionMcpServers('gh-token', dir);
      const server = mcpServers['m365-teams'] as { headers?: Record<string, string> };
      expect(server.headers?.Authorization).toBeUndefined();
      expect(mcpServers.github).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('wires session hooks when onHookEvent callback is provided', async () => {
    const client = createClientMock();
    const onHookEvent = vi.fn();

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token', {
      onHookEvent,
    });

    const config = getSessionConfig(client);
    expect(config.hooks).toBeDefined();
    expect(config.hooks).toHaveProperty('onPreToolUse');
    expect(config.hooks).toHaveProperty('onPostToolUse');
    expect(config.hooks).toHaveProperty('onUserPromptSubmitted');
    expect(config.hooks).toHaveProperty('onSessionStart');
    expect(config.hooks).toHaveProperty('onSessionEnd');
    expect(config.hooks).toHaveProperty('onErrorOccurred');
  });

  it('omits hooks when onHookEvent is not provided', async () => {
    const client = createClientMock();

    await createCopilotSession(client as unknown as Parameters<typeof createCopilotSession>[0], 'gh-token');

    const config = getSessionConfig(client);
    expect(config.hooks).toBeUndefined();
  });

});

describe('buildSessionHooks', () => {
  it('sends hook_pre_tool message with tool name and args', () => {
    const callback = vi.fn();
    const hooks = buildSessionHooks(callback);

    hooks!.onPreToolUse!(
      { toolName: 'bash', toolArgs: { command: 'ls' }, timestamp: 1, cwd: '/tmp' },
      { sessionId: 's1' },
    );

    expect(callback).toHaveBeenCalledWith({
      type: 'hook_pre_tool',
      toolName: 'bash',
      toolArgs: { command: 'ls' },
    });
  });

  it('sends hook_post_tool message with tool name and args', () => {
    const callback = vi.fn();
    const hooks = buildSessionHooks(callback);

    hooks!.onPostToolUse!(
      { toolName: 'read', toolArgs: { path: '/file' }, toolResult: { content: 'ok' } as any, timestamp: 1, cwd: '/tmp' },
      { sessionId: 's1' },
    );

    expect(callback).toHaveBeenCalledWith({
      type: 'hook_post_tool',
      toolName: 'read',
      toolArgs: { path: '/file' },
    });
  });

  it('sends hook_session_start message with source', () => {
    const callback = vi.fn();
    const hooks = buildSessionHooks(callback);

    hooks!.onSessionStart!(
      { source: 'new', timestamp: 1, cwd: '/tmp' },
      { sessionId: 's1' },
    );

    expect(callback).toHaveBeenCalledWith({
      type: 'hook_session_start',
      source: 'new',
    });
  });

  it('sends hook_session_end message with reason', () => {
    const callback = vi.fn();
    const hooks = buildSessionHooks(callback);

    hooks!.onSessionEnd!(
      { reason: 'complete', timestamp: 1, cwd: '/tmp' },
      { sessionId: 's1' },
    );

    expect(callback).toHaveBeenCalledWith({
      type: 'hook_session_end',
      reason: 'complete',
    });
  });

  it('sends hook_error message with error details', () => {
    const callback = vi.fn();
    const hooks = buildSessionHooks(callback);

    hooks!.onErrorOccurred!(
      { error: 'timeout', errorContext: 'tool_execution', recoverable: true, timestamp: 1, cwd: '/tmp' },
      { sessionId: 's1' },
    );

    expect(callback).toHaveBeenCalledWith({
      type: 'hook_error',
      error: 'timeout',
      errorContext: 'tool_execution',
      recoverable: true,
    });
  });

  it('forwards user prompt submitted events', () => {
    const callback = vi.fn();
    const hooks = buildSessionHooks(callback);

    hooks!.onUserPromptSubmitted!(
      { timestamp: Date.now(), cwd: '/test', prompt: 'hello world' } as any,
      { sessionId: 'test-session' },
    );

    expect(callback).toHaveBeenCalledWith({
      type: 'hook_user_prompt',
      prompt: 'hello world',
    });
  });
});

describe('getAvailableModels', () => {
  it('returns arrays directly from the client', async () => {
    const client = createClientMock();
    client.listModels.mockResolvedValue([{ id: 'gpt-4.1' }]);

    await expect(getAvailableModels(client as unknown as Parameters<typeof getAvailableModels>[0])).resolves.toEqual([{ id: 'gpt-4.1' }]);
  });

  it('reads model arrays from object responses', async () => {
    const client = createClientMock();
    client.listModels.mockResolvedValueOnce({ models: [{ id: 'claude-sonnet-4.5' }] });
    await expect(getAvailableModels(client as unknown as Parameters<typeof getAvailableModels>[0])).resolves.toEqual([{ id: 'claude-sonnet-4.5' }]);

    client.listModels.mockResolvedValueOnce({ data: [{ id: 'gemini-3-pro-preview' }] });
    await expect(getAvailableModels(client as unknown as Parameters<typeof getAvailableModels>[0])).resolves.toEqual([{ id: 'gemini-3-pro-preview' }]);
  });

  it('returns an empty array for unknown shapes or client errors', async () => {
    const client = createClientMock();
    client.listModels.mockResolvedValueOnce({});
    await expect(getAvailableModels(client as unknown as Parameters<typeof getAvailableModels>[0])).resolves.toEqual([]);

    client.listModels.mockRejectedValueOnce(new Error('boom'));
    await expect(getAvailableModels(client as unknown as Parameters<typeof getAvailableModels>[0])).resolves.toEqual([]);
  });
});
