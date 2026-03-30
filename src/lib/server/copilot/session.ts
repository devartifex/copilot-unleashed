import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { CopilotClient } from '@github/copilot-sdk';
import type { SessionConfig, SystemPromptSection, SectionOverride, MCPServerConfig } from '@github/copilot-sdk';

export type HookEventCallback = (message: Record<string, unknown>) => void;
import { isIP } from 'node:net';
import { config } from '../config.js';

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

function validateOutboundUrl(kind: 'Tool' | 'MCP server', name: string, rawUrl: string): void {
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
  } catch {
    return {};
  }
}

export async function buildSessionMcpServers(
  githubToken: string,
  configDir?: string,
) : Promise<Record<string, MCPServerConfig>> {
  const configuredMcpServers = await loadConfiguredMcpServers(configDir);

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

// ╔══════════════════════════════════════════════════════════════╗
// ║ DEMO — Step 3: Creare una Sessione con il SDK               ║
// ║ SessionConfig è il cuore dell'integrazione: modello,         ║
// ║ streaming, MCP servers, hook, agenti, istruzioni custom.     ║
// ╚══════════════════════════════════════════════════════════════╝
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
