import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { CopilotClient } from '@github/copilot-sdk';
import type { SessionConfig, SystemPromptSection, SectionOverride, MCPServerConfig, ModelCapabilitiesOverride } from '@github/copilot-sdk';

export type HookEventCallback = (message: Record<string, unknown>) => void;
import { isIP } from 'node:net';
import { config } from '../config.js';
import { createSessionFsHandlerFactory } from './session-fs.js';

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export interface InfiniteSessionsConfig {
  enabled: boolean;
  backgroundCompactionThreshold?: number;
  bufferExhaustionThreshold?: number;
}

export interface CreateSessionOptions {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  customInstructions?: string;
  excludedTools?: string[];
  availableTools?: string[];
  infiniteSessions?: InfiniteSessionsConfig;
  onUserInputRequest?: SessionConfig['onUserInputRequest'];
  permissionMode?: 'approve_all' | 'prompt';
  onPermissionRequest?: SessionConfig['onPermissionRequest'];
  configDir?: string;
  skillDirectories?: string[];
  disabledSkills?: string[];
  customAgents?: Array<{
    name: string;
    displayName?: string;
    description?: string;
    tools?: string[];
    prompt: string;
  }>;
  agent?: string;
  onEvent?: (event: any) => void;
  onHookEvent?: HookEventCallback;
  systemPromptSections?: Partial<Record<SystemPromptSection, SectionOverride>>;
  modelCapabilities?: ModelCapabilitiesOverride;
  enableConfigDiscovery?: boolean;
  provider?: SessionConfig['provider'];
  onElicitationRequest?: SessionConfig['onElicitationRequest'];
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map((segment) => Number.parseInt(segment, 10));
  if (octets.length !== 4 || octets.some((segment) => Number.isNaN(segment) || segment < 0 || segment > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === '::' || normalized === '::1') {
    return true;
  }

  const firstSegment = normalized.split(':').find((segment) => segment.length > 0);
  if (!firstSegment) {
    return false;
  }

  const firstHextet = Number.parseInt(firstSegment, 16);
  if (Number.isNaN(firstHextet)) {
    return false;
  }

  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized === '0.0.0.0') {
    return true;
  }

  switch (isIP(normalized)) {
    case 4:
      return isPrivateIpv4(normalized);
    case 6:
      return isPrivateIpv6(normalized);
    default:
      return false;
  }
}

function safeServerLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '[invalid-url]';
  }
}

function validateOutboundUrl(kind: 'Tool' | 'MCP server' | 'MCP token endpoint', name: string, rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${kind} "${name}": invalid URL`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${kind} "${name}": HTTPS required`);
  }

  if (url.username || url.password) {
    throw new Error(`${kind} "${name}": auth credentials in URLs are not allowed`);
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error(`${kind} "${name}": internal network URLs are not allowed`);
  }
}

function validateMcpServerUrl(name: string, serverUrl: string): void {
  validateOutboundUrl('MCP server', name, serverUrl);
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => [k, v as string]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

interface McpOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  expires_at?: number;
  scope: string;
}

interface McpOAuthConfig {
  serverUrl: string;
  authorizationServerUrl: string;
  clientId: string;
  redirectUri: string;
  resourceUrl: string;
  issuedAt: number;
  isStatic: boolean;
}

/**
 * Refreshes an expired OAuth token using the refresh_token grant.
 * Writes the updated tokens back to the CLI's token store so both
 * copilot-unleashed and the CLI stay in sync.
 */
async function refreshOAuthToken(
  oauthConfig: McpOAuthConfig,
  tokens: McpOAuthTokens,
  tokensPath: string,
): Promise<string | null> {
  if (!tokens.refreshToken || !oauthConfig.clientId) return null;

  // Derive token endpoint from authorization server URL
  // authorizationServerUrl is e.g. "https://login.microsoftonline.com/organizations/v2.0"
  const tokenUrl = oauthConfig.authorizationServerUrl.replace(/\/v2\.0\/?$/, '/oauth2/v2.0/token');

  try {
    validateOutboundUrl('MCP token endpoint', oauthConfig.serverUrl, tokenUrl);
  } catch (err) {
    console.warn(`[MCP] Token refresh blocked (SSRF check failed) for ${safeServerLabel(oauthConfig.serverUrl)}`);
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: oauthConfig.clientId,
      refresh_token: tokens.refreshToken,
      scope: tokens.scope,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual',
    });

    if (!response.ok) {
      console.warn(`[MCP] Token refresh failed (${response.status}) for ${safeServerLabel(oauthConfig.serverUrl)}`);
      return null;
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    const refreshed: McpOAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      scope: data.scope || tokens.scope,
    };

    // Write back atomically so CLI stays in sync
    const tmpPath = tokensPath + '.tmp.' + randomUUID();
    await writeFile(tmpPath, JSON.stringify(refreshed), { encoding: 'utf8', mode: 0o600 });
    await rename(tmpPath, tokensPath);

    console.log(`[MCP] Refreshed OAuth token for ${safeServerLabel(oauthConfig.serverUrl)}`);
    return refreshed.accessToken;
  } catch (err) {
    console.warn(`[MCP] Token refresh error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Reads M365 OAuth tokens managed by the Copilot CLI.
 * The CLI stores tokens in ~/.copilot/mcp-oauth-config/{SHA256(serverUrl)}.tokens.json
 * after the user authenticates via `copilot /mcp` → re-auth flow.
 * If the token is expired but a refresh token exists, attempts to refresh automatically.
 */
async function loadCliOAuthToken(
  serverUrl: string,
  configDir: string,
): Promise<{ token?: string; expired?: boolean }> {
  const hash = createHash('sha256').update(serverUrl).digest('hex');
  const tokensPath = join(configDir, 'mcp-oauth-config', `${hash}.tokens.json`);
  const configPath = join(configDir, 'mcp-oauth-config', `${hash}.json`);

  try {
    const raw = await readFile(tokensPath, 'utf8');
    const tokens: McpOAuthTokens = JSON.parse(raw);

    if (!tokens.accessToken) {
      return {};
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const effectiveExpiresAt = tokens.expiresAt ?? tokens.expires_at;
    // Refresh 2 minutes before expiry to avoid edge-case failures
    if (effectiveExpiresAt && effectiveExpiresAt <= nowSec + 120) {
      // Attempt refresh
      try {
        const configRaw = await readFile(configPath, 'utf8');
        const oauthConfig: McpOAuthConfig = JSON.parse(configRaw);
        const refreshed = await refreshOAuthToken(oauthConfig, tokens, tokensPath);
        if (refreshed) {
          return { token: refreshed };
        }
      } catch {
        // Config file missing or unreadable - can't refresh
      }
      return { expired: true };
    }

    return { token: tokens.accessToken };
  } catch {
    return {};
  }
}

/**
 * For HTTP MCP servers that require OAuth (no static Authorization header),
 * attempt to inject a bearer token from the Copilot CLI's token store.
 */
async function injectOAuthHeaders(
  servers: Record<string, MCPServerConfig>,
  configDir: string,
): Promise<string[]> {
  const warnings: string[] = [];

  for (const [name, server] of Object.entries(servers)) {
    if (server.type !== 'http' && server.type !== 'sse') continue;

    const httpServer = server as { url: string; headers?: Record<string, string> };
    // Skip servers that already have an Authorization header
    if (httpServer.headers?.Authorization || httpServer.headers?.authorization) continue;

    const result = await loadCliOAuthToken(httpServer.url, configDir);

    if (result.expired) {
      warnings.push(
        `[MCP] OAuth token for "${name}" has expired and refresh failed. Initial CLI auth via \`copilot /mcp\` may be needed.`,
      );
      continue;
    }

    if (result.token) {
      httpServer.headers = { ...httpServer.headers, Authorization: `Bearer ${result.token}` };
      console.log(`[MCP] Injected OAuth token for "${name}" from CLI token store`);
    }
  }

  return warnings;
}

async function loadConfiguredMcpServers(configDir?: string): Promise<Record<string, MCPServerConfig>> {
  const resolvedConfigDir = configDir || config.copilotConfigDir || join(homedir(), '.copilot');
  const configPath = join(resolvedConfigDir, 'mcp-config.json');

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, Record<string, unknown>>; servers?: Record<string, Record<string, unknown>> };
    const configured = parsed.mcpServers || parsed.servers || {};
    const result: Record<string, MCPServerConfig> = {};

    for (const [name, server] of Object.entries(configured)) {
      const type = typeof server.type === 'string' ? server.type : undefined;

      if ((type === 'http' || type === 'sse') && typeof server.url === 'string') {
        validateMcpServerUrl(name, server.url);
        result[name] = {
          type,
          url: server.url,
          ...(normalizeStringRecord(server.headers) ? { headers: normalizeStringRecord(server.headers) } : {}),
          tools: Array.isArray(server.tools) && server.tools.length > 0 ? server.tools : ['*'],
          ...(typeof server.timeout === 'number' && server.timeout > 0 ? { timeout: server.timeout } : {}),
        };
        continue;
      }

      if ((type === 'stdio' || type === 'local' || typeof server.command === 'string') && typeof server.command === 'string') {
        result[name] = {
          type: type === 'local' ? 'local' : 'stdio',
          command: server.command,
          args: Array.isArray(server.args) ? server.args.filter((arg): arg is string => typeof arg === 'string') : [],
          ...(normalizeStringRecord(server.env) ? { env: normalizeStringRecord(server.env) } : {}),
          ...(typeof server.cwd === 'string' ? { cwd: server.cwd } : {}),
          tools: Array.isArray(server.tools) && server.tools.length > 0 ? server.tools : ['*'],
          ...(typeof server.timeout === 'number' && server.timeout > 0 ? { timeout: server.timeout } : {}),
        };
      }
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    console.error('[MCP] Failed to load configured MCP servers:', err instanceof Error ? err.message : err);
    return {};
  }
}

export async function buildSessionMcpServers(
  githubToken: string,
  configDir?: string,
) : Promise<Record<string, MCPServerConfig>> {
  const resolvedConfigDir = configDir || config.copilotConfigDir || join(homedir(), '.copilot');
  const configuredMcpServers = await loadConfiguredMcpServers(configDir);

  // Inject OAuth tokens from the Copilot CLI's token store for HTTP servers
  const warnings = await injectOAuthHeaders(configuredMcpServers, resolvedConfigDir);
  for (const warning of warnings) {
    console.warn(warning);
  }

  return {
    ...configuredMcpServers,
    github: {
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/x/all',
      headers: {
        Authorization: `Bearer ${githubToken}`,
      },
      tools: ['*'],
    },
  };
}

export function buildSessionHooks(onHookEvent: HookEventCallback): SessionConfig['hooks'] {
  return {
    onPreToolUse: (input) => {
      onHookEvent({ type: 'hook_pre_tool', toolName: input.toolName, toolArgs: input.toolArgs });
    },
    onPostToolUse: (input) => {
      onHookEvent({ type: 'hook_post_tool', toolName: input.toolName, toolArgs: input.toolArgs });
    },
    onUserPromptSubmitted: (input) => {
      onHookEvent({ type: 'hook_user_prompt', prompt: input.prompt });
    },
    onSessionStart: (input) => {
      onHookEvent({ type: 'hook_session_start', source: input.source });
    },
    onSessionEnd: (input) => {
      onHookEvent({ type: 'hook_session_end', reason: input.reason });
    },
    onErrorOccurred: (input) => {
      onHookEvent({
        type: 'hook_error',
        error: input.error,
        errorContext: input.errorContext,
        recoverable: input.recoverable,
      });
    },
  };
}

export async function createCopilotSession(
  client: CopilotClient,
  githubToken: string,
  options: CreateSessionOptions = {}
) {
  // Wrap the permission handler to log calls for diagnostics
  const wrappedApproveAll: SessionConfig['onPermissionRequest'] = (request: any, context) => {
    console.log('[PERMISSION] approveAll called:', JSON.stringify({
      toolName: request?.toolName ?? request?.tool?.name,
      sessionId: context?.sessionId,
    }));
    return { kind: 'approved' as const };
  };

  const permissionHandler = options.permissionMode === 'prompt' && options.onPermissionRequest
    ? options.onPermissionRequest
    : wrappedApproveAll;

  console.log('[SESSION] Creating session with permissionMode:', options.permissionMode || 'approve_all (default)');

  const sessionConfig: SessionConfig = {
    clientName: 'copilot-unleashed',
    model: options.model || 'gpt-4.1',
    streaming: true,
    onPermissionRequest: permissionHandler,
    ...(config.copilotConfigDir && { configDir: config.copilotConfigDir }),
    mcpServers: await buildSessionMcpServers(githubToken, options.configDir),
  };

  if (options.reasoningEffort) {
    sessionConfig.reasoningEffort = options.reasoningEffort;
  }

  if (options.excludedTools && options.excludedTools.length > 0) {
    sessionConfig.excludedTools = options.excludedTools;
  }

  if (options.availableTools && options.availableTools.length > 0) {
    sessionConfig.availableTools = options.availableTools;
  }

  if (options.systemPromptSections && Object.keys(options.systemPromptSections).length > 0) {
    const sections: Partial<Record<SystemPromptSection, SectionOverride>> = { ...options.systemPromptSections };
    if (options.customInstructions && !sections.custom_instructions) {
      sections.custom_instructions = { action: 'append', content: options.customInstructions };
    }
    sessionConfig.systemMessage = { mode: 'customize', sections };
  } else if (options.customInstructions) {
    sessionConfig.systemMessage = { mode: 'append', content: options.customInstructions };
  }

  if (options.onUserInputRequest) {
    sessionConfig.onUserInputRequest = options.onUserInputRequest;
  }

  if (options.onElicitationRequest) {
    sessionConfig.onElicitationRequest = options.onElicitationRequest;
  }

  if (options.infiniteSessions) {
    sessionConfig.infiniteSessions = {
      enabled: options.infiniteSessions.enabled,
      ...(options.infiniteSessions.backgroundCompactionThreshold != null && {
        backgroundCompactionThreshold: options.infiniteSessions.backgroundCompactionThreshold,
      }),
      ...(options.infiniteSessions.bufferExhaustionThreshold != null && {
        bufferExhaustionThreshold: options.infiniteSessions.bufferExhaustionThreshold,
      }),
    };
  }

  if (options.configDir) {
    sessionConfig.configDir = options.configDir;
  }

  if (options.skillDirectories && options.skillDirectories.length > 0) {
    sessionConfig.skillDirectories = options.skillDirectories;
  }

  if (options.disabledSkills && options.disabledSkills.length > 0) {
    sessionConfig.disabledSkills = options.disabledSkills;
  }

  if (options.customAgents && options.customAgents.length > 0) {
    sessionConfig.customAgents = options.customAgents;
  }

  if (options.agent && typeof options.agent === 'string') {
    sessionConfig.agent = options.agent;
  }

  if (options.onEvent) {
    sessionConfig.onEvent = options.onEvent;
  }

  if (options.onHookEvent) {
    sessionConfig.hooks = buildSessionHooks(options.onHookEvent);
  }

  if (options.modelCapabilities) {
    sessionConfig.modelCapabilities = options.modelCapabilities;
  }

  if (options.enableConfigDiscovery != null) {
    sessionConfig.enableConfigDiscovery = options.enableConfigDiscovery;
  }

  if (options.provider) {
    sessionConfig.provider = options.provider;
  }

  // Provide a sandboxed filesystem handler so the SDK can manage session workspace files
  if (config.copilotConfigDir) {
    const workspaceRoot = join(config.copilotConfigDir, 'session-state');
    sessionConfig.createSessionFsHandler = createSessionFsHandlerFactory(workspaceRoot);
  }

  return client.createSession(sessionConfig);
}

export async function getAvailableModels(client: CopilotClient) {
  try {
    const result = await client.listModels();
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj.models)) return obj.models;
      if (Array.isArray(obj.data)) return obj.data;
    }
    return [];
  } catch {
    return [];
  }
}
