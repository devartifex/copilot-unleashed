import type {
  SessionMode,
  ReasoningEffort,
  PersistedSettings,
  CustomToolDefinition,
  McpServerDefinition,
  SourcedSkillInfo,
  SourcedMcpServerInfo,
  InfiniteSessionsConfig,
  InstructionInfo,
  PromptInfo,
} from '$lib/types/index.js';

const STORAGE_KEY = 'copilot-cli-settings';

const DEFAULT_INFINITE_SESSIONS: InfiniteSessionsConfig = {
  enabled: true,
  backgroundThreshold: 0.80,
  bufferThreshold: 0.95,
};

const DEFAULT_SETTINGS: PersistedSettings = {
  model: '',
  mode: 'interactive',
  reasoningEffort: 'medium',
  additionalInstructions: '',
  excludedTools: [],
  customTools: [],
  mcpServers: [],
  infiniteSessions: { ...DEFAULT_INFINITE_SESSIONS },
  notificationsEnabled: false,
};

const VALID_MODES = new Set<SessionMode>(['interactive', 'plan', 'autopilot']);
const VALID_REASONING = new Set<ReasoningEffort>(['low', 'medium', 'high', 'xhigh']);

function isValidCustomTool(t: unknown): t is CustomToolDefinition {
  if (!t || typeof t !== 'object') return false;
  const obj = t as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.webhookUrl === 'string' &&
    (obj.method === 'GET' || obj.method === 'POST') &&
    typeof obj.headers === 'object' && obj.headers !== null &&
    typeof obj.parameters === 'object' && obj.parameters !== null
  );
}

function isValidMcpServer(s: unknown): s is McpServerDefinition {
  if (!s || typeof s !== 'object') return false;
  const obj = s as Record<string, unknown>;
  if (
    typeof obj.name !== 'string' ||
    typeof obj.url !== 'string' ||
    (obj.type !== 'http' && obj.type !== 'sse') ||
    typeof obj.headers !== 'object' || obj.headers === null ||
    !Array.isArray(obj.tools) ||
    typeof obj.enabled !== 'boolean'
  ) return false;
  if ('timeout' in obj && obj.timeout !== undefined) {
    if (typeof obj.timeout !== 'number' || obj.timeout <= 0) return false;
  }
  return true;
}

export interface SettingsStore {
  additionalInstructions: string;
  excludedTools: string[];
  customTools: CustomToolDefinition[];
  reasoningEffort: ReasoningEffort;
  selectedModel: string;
  selectedMode: SessionMode;
  mcpServers: McpServerDefinition[];
  discoveredMcpServers: SourcedMcpServerInfo[];
  availableSkills: SourcedSkillInfo[];
  instructions: InstructionInfo[];
  prompts: PromptInfo[];
  infiniteSessions: InfiniteSessionsConfig;
  notificationsEnabled: boolean;
  load(): void;
  save(): void;
  syncFromServer(): Promise<void>;
  fetchSkills(): Promise<void>;
  fetchCustomizations(): Promise<void>;
}

export function createSettingsStore(): SettingsStore {
  let additionalInstructions = $state(DEFAULT_SETTINGS.additionalInstructions);
  let excludedTools = $state<string[]>([...DEFAULT_SETTINGS.excludedTools]);
  let customTools = $state<CustomToolDefinition[]>([...DEFAULT_SETTINGS.customTools]);
  let reasoningEffort = $state<ReasoningEffort>(DEFAULT_SETTINGS.reasoningEffort);
  let selectedModel = $state(DEFAULT_SETTINGS.model);
  let selectedMode = $state<SessionMode>(DEFAULT_SETTINGS.mode);
  let mcpServers = $state<McpServerDefinition[]>([...(DEFAULT_SETTINGS.mcpServers ?? [])]);
  let availableSkills = $state<SourcedSkillInfo[]>([]);
  let discoveredMcpServers = $state<SourcedMcpServerInfo[]>([]);
  let instructions = $state<InstructionInfo[]>([]);
  let prompts = $state<PromptInfo[]>([]);
  let infiniteSessions = $state<InfiniteSessionsConfig>({ ...DEFAULT_INFINITE_SESSIONS });
  let notificationsEnabled = $state(DEFAULT_SETTINGS.notificationsEnabled ?? false);

  function load(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
      applySettings(parsed);
    } catch {
      // Ignore corrupt data
    }
  }

  function getCurrentData(): PersistedSettings {
    return {
      model: selectedModel,
      mode: selectedMode,
      reasoningEffort,
      additionalInstructions,
      excludedTools,
      customTools,
      mcpServers,
      infiniteSessions,
      notificationsEnabled,
    };
  }

  function applySettings(parsed: Partial<PersistedSettings>): void {
    if (parsed.model && typeof parsed.model === 'string') {
      selectedModel = parsed.model;
    }
    // Mode is intentionally not restored — always defaults to 'interactive' (Ask)
    if (parsed.reasoningEffort && VALID_REASONING.has(parsed.reasoningEffort as ReasoningEffort)) {
      reasoningEffort = parsed.reasoningEffort as ReasoningEffort;
    }
    // Accept both new and legacy field names for backward compatibility
    const instructions = parsed.additionalInstructions ?? (parsed as Record<string, unknown>).customInstructions;
    if (typeof instructions === 'string') {
      additionalInstructions = instructions;
    }
    if (Array.isArray(parsed.excludedTools)) {
      excludedTools = parsed.excludedTools.filter((t): t is string => typeof t === 'string');
    }
    if (Array.isArray(parsed.customTools)) {
      customTools = parsed.customTools.filter(isValidCustomTool).slice(0, 10);
    }
    if (Array.isArray(parsed.mcpServers)) {
      mcpServers = parsed.mcpServers.filter(isValidMcpServer).slice(0, 10);
    }
    if (parsed.infiniteSessions && typeof parsed.infiniteSessions === 'object') {
      const is = parsed.infiniteSessions;
      infiniteSessions = {
        enabled: typeof is.enabled === 'boolean' ? is.enabled : DEFAULT_INFINITE_SESSIONS.enabled,
        backgroundThreshold: typeof is.backgroundThreshold === 'number'
          ? Math.max(0, Math.min(1, is.backgroundThreshold))
          : DEFAULT_INFINITE_SESSIONS.backgroundThreshold,
        bufferThreshold: typeof is.bufferThreshold === 'number'
          ? Math.max(0, Math.min(1, is.bufferThreshold))
          : DEFAULT_INFINITE_SESSIONS.bufferThreshold,
      };
    }
    if (typeof parsed.notificationsEnabled === 'boolean') {
      notificationsEnabled = parsed.notificationsEnabled;
    }
  }

  function save(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getCurrentData()));
    } catch {
      // Ignore quota errors
    }
    // Fire-and-forget sync to server
    syncToServer();
  }

  function syncToServer(): void {
    try {
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: getCurrentData() }),
      }).catch(() => { /* ignore network errors */ });
    } catch {
      // Ignore errors
    }
  }

  async function syncFromServer(): Promise<void> {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const body = await res.json() as { settings?: PersistedSettings | null };
      if (body.settings) {
        applySettings(body.settings);
        // Update localStorage with server data
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(getCurrentData()));
        }
      } else {
        // No server data yet — push current local settings to server
        syncToServer();
      }
    } catch {
      // Ignore fetch errors — use local data
    }
  }

  async function fetchSkills(): Promise<void> {
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) return;
      const body = await res.json() as { skills?: SourcedSkillInfo[] };
      if (Array.isArray(body.skills)) {
        availableSkills = body.skills;
      }
    } catch {
      // Ignore fetch errors
    }
  }

  async function fetchCustomizations(): Promise<void> {
    try {
      const res = await fetch('/api/customizations');
      if (!res.ok) return;
      const body = await res.json() as {
        instructions?: InstructionInfo[];
        prompts?: PromptInfo[];
        mcpServers?: SourcedMcpServerInfo[];
      };
      if (Array.isArray(body.instructions)) {
        instructions = body.instructions;
      }
      if (Array.isArray(body.prompts)) {
        prompts = body.prompts;
      }
      if (Array.isArray(body.mcpServers)) {
        discoveredMcpServers = body.mcpServers;
      }
    } catch {
      // Ignore fetch errors
    }
  }

  return {
    get additionalInstructions() { return additionalInstructions; },
    set additionalInstructions(v: string) { additionalInstructions = v; save(); },

    get excludedTools() { return excludedTools; },
    set excludedTools(v: string[]) { excludedTools = v; save(); },

    get customTools() { return customTools; },
    set customTools(v: CustomToolDefinition[]) { customTools = v.slice(0, 10); save(); },

    get reasoningEffort() { return reasoningEffort; },
    set reasoningEffort(v: ReasoningEffort) { reasoningEffort = v; save(); },

    get selectedModel() { return selectedModel; },
    set selectedModel(v: string) { selectedModel = v; save(); },

    get selectedMode() { return selectedMode; },
    set selectedMode(v: SessionMode) { selectedMode = v; save(); },

    get mcpServers() { return mcpServers; },
    set mcpServers(v: McpServerDefinition[]) { mcpServers = v.slice(0, 10); save(); },

    get availableSkills() { return availableSkills; },
    set availableSkills(v: SourcedSkillInfo[]) { availableSkills = v; },

    get discoveredMcpServers() { return discoveredMcpServers; },
    set discoveredMcpServers(v: SourcedMcpServerInfo[]) { discoveredMcpServers = v; },

    get instructions() { return instructions; },
    set instructions(v: InstructionInfo[]) { instructions = v; },

    get prompts() { return prompts; },
    set prompts(v: PromptInfo[]) { prompts = v; },

    get infiniteSessions() { return infiniteSessions; },
    set infiniteSessions(v: InfiniteSessionsConfig) {
      infiniteSessions = {
        enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_INFINITE_SESSIONS.enabled,
        backgroundThreshold: typeof v.backgroundThreshold === 'number'
          ? Math.max(0, Math.min(1, v.backgroundThreshold))
          : DEFAULT_INFINITE_SESSIONS.backgroundThreshold,
        bufferThreshold: typeof v.bufferThreshold === 'number'
          ? Math.max(0, Math.min(1, v.bufferThreshold))
          : DEFAULT_INFINITE_SESSIONS.bufferThreshold,
      };
      save();
    },

    get notificationsEnabled() { return notificationsEnabled; },
    set notificationsEnabled(v: boolean) { notificationsEnabled = v; save(); },

    load,
    save,
    syncFromServer,
    fetchSkills,
    fetchCustomizations,
  };
}
