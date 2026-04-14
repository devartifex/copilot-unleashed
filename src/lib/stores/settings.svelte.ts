import type {
  SessionMode,
  ReasoningEffort,
  PersistedSettings,
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
  infiniteSessions: { ...DEFAULT_INFINITE_SESSIONS },
  notificationsEnabled: false,
  voiceInputEnabled: true,
  ttsEnabled: true,
  ttsRate: 1.0,
};

const VALID_MODES = new Set<SessionMode>(['interactive', 'plan', 'autopilot']);
const VALID_REASONING = new Set<ReasoningEffort>(['low', 'medium', 'high', 'xhigh']);

export interface SettingsStore {
  additionalInstructions: string;
  excludedTools: string[];
  reasoningEffort: ReasoningEffort;
  selectedModel: string;
  selectedMode: SessionMode;
  discoveredMcpServers: SourcedMcpServerInfo[];
  availableSkills: SourcedSkillInfo[];
  extensions: Array<{ name: string; description?: string; enabled: boolean }>;
  instructions: InstructionInfo[];
  prompts: PromptInfo[];
  infiniteSessions: InfiniteSessionsConfig;
  notificationsEnabled: boolean;
  voiceInputEnabled: boolean;
  ttsEnabled: boolean;
  ttsRate: number;
  load(): void;
  save(): void;
  syncFromServer(): Promise<void>;
  fetchSkills(): Promise<void>;
  fetchCustomizations(): Promise<void>;
}

export function createSettingsStore(): SettingsStore {
  let additionalInstructions = $state(DEFAULT_SETTINGS.additionalInstructions);
  let excludedTools = $state<string[]>([...DEFAULT_SETTINGS.excludedTools]);
  let reasoningEffort = $state<ReasoningEffort>(DEFAULT_SETTINGS.reasoningEffort);
  let selectedModel = $state(DEFAULT_SETTINGS.model);
  let selectedMode = $state<SessionMode>(DEFAULT_SETTINGS.mode);
  let availableSkills = $state<SourcedSkillInfo[]>([]);
  let discoveredMcpServers = $state<SourcedMcpServerInfo[]>([]);
  let extensions = $state<Array<{ name: string; description?: string; enabled: boolean }>>([]);
  let instructions = $state<InstructionInfo[]>([]);
  let prompts = $state<PromptInfo[]>([]);
  let infiniteSessions = $state<InfiniteSessionsConfig>({ ...DEFAULT_INFINITE_SESSIONS });
  let notificationsEnabled = $state(DEFAULT_SETTINGS.notificationsEnabled ?? false);
  let voiceInputEnabled = $state(DEFAULT_SETTINGS.voiceInputEnabled ?? true);
  let ttsEnabled = $state(DEFAULT_SETTINGS.ttsEnabled ?? true);
  let ttsRate = $state(DEFAULT_SETTINGS.ttsRate ?? 1.0);

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
      infiniteSessions,
      notificationsEnabled,
      voiceInputEnabled,
      ttsEnabled,
      ttsRate,
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
    if (typeof parsed.voiceInputEnabled === 'boolean') {
      voiceInputEnabled = parsed.voiceInputEnabled;
    }
    if (typeof parsed.ttsEnabled === 'boolean') {
      ttsEnabled = parsed.ttsEnabled;
    }
    if (typeof parsed.ttsRate === 'number') {
      ttsRate = Math.max(0.5, Math.min(2, parsed.ttsRate));
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

    get reasoningEffort() { return reasoningEffort; },
    set reasoningEffort(v: ReasoningEffort) { reasoningEffort = v; save(); },

    get selectedModel() { return selectedModel; },
    set selectedModel(v: string) { selectedModel = v; save(); },

    get selectedMode() { return selectedMode; },
    set selectedMode(v: SessionMode) { selectedMode = v; save(); },

    get availableSkills() { return availableSkills; },
    set availableSkills(v: SourcedSkillInfo[]) { availableSkills = v; },

    get extensions() { return extensions; },
    set extensions(v: Array<{ name: string; description?: string; enabled: boolean }>) { extensions = v; },

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

    get voiceInputEnabled() { return voiceInputEnabled; },
    set voiceInputEnabled(v: boolean) { voiceInputEnabled = v; save(); },

    get ttsEnabled() { return ttsEnabled; },
    set ttsEnabled(v: boolean) { ttsEnabled = v; save(); },

    get ttsRate() { return ttsRate; },
    set ttsRate(v: number) { ttsRate = Math.max(0.5, Math.min(2, v)); save(); },

    load,
    save,
    syncFromServer,
    fetchSkills,
    fetchCustomizations,
  };
}
