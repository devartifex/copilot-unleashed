import type {
  SessionMode,
  ReasoningEffort,
  PersistedSettings,
} from '$lib/types/index.js';

const STORAGE_KEY = 'copilot-cli-settings';

const DEFAULT_SETTINGS: PersistedSettings = {
  model: '',
  mode: 'interactive',
  reasoningEffort: 'medium',
  customInstructions: '',
  excludedTools: [],
};

const VALID_MODES = new Set<SessionMode>(['interactive', 'plan', 'autopilot']);
const VALID_REASONING = new Set<ReasoningEffort>(['low', 'medium', 'high', 'xhigh']);

export interface SettingsStore {
  customInstructions: string;
  excludedTools: string[];
  reasoningEffort: ReasoningEffort;
  selectedModel: string;
  selectedMode: SessionMode;
  load(): void;
  save(): void;
}

export function createSettingsStore(): SettingsStore {
  let customInstructions = $state(DEFAULT_SETTINGS.customInstructions);
  let excludedTools = $state<string[]>([...DEFAULT_SETTINGS.excludedTools]);
  let reasoningEffort = $state<ReasoningEffort>(DEFAULT_SETTINGS.reasoningEffort);
  let selectedModel = $state(DEFAULT_SETTINGS.model);
  let selectedMode = $state<SessionMode>(DEFAULT_SETTINGS.mode);

  function load(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;

      if (parsed.model && typeof parsed.model === 'string') {
        selectedModel = parsed.model;
      }
      if (parsed.mode && VALID_MODES.has(parsed.mode as SessionMode)) {
        selectedMode = parsed.mode as SessionMode;
      }
      if (parsed.reasoningEffort && VALID_REASONING.has(parsed.reasoningEffort as ReasoningEffort)) {
        reasoningEffort = parsed.reasoningEffort as ReasoningEffort;
      }
      if (typeof parsed.customInstructions === 'string') {
        customInstructions = parsed.customInstructions;
      }
      if (Array.isArray(parsed.excludedTools)) {
        excludedTools = parsed.excludedTools.filter((t): t is string => typeof t === 'string');
      }
    } catch {
      // Ignore corrupt data
    }
  }

  function save(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const data: PersistedSettings = {
        model: selectedModel,
        mode: selectedMode,
        reasoningEffort,
        customInstructions,
        excludedTools,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota errors
    }
  }

  return {
    get customInstructions() { return customInstructions; },
    set customInstructions(v: string) { customInstructions = v; save(); },

    get excludedTools() { return excludedTools; },
    set excludedTools(v: string[]) { excludedTools = v; save(); },

    get reasoningEffort() { return reasoningEffort; },
    set reasoningEffort(v: ReasoningEffort) { reasoningEffort = v; save(); },

    get selectedModel() { return selectedModel; },
    set selectedModel(v: string) { selectedModel = v; save(); },

    get selectedMode() { return selectedMode; },
    set selectedMode(v: SessionMode) { selectedMode = v; save(); },

    load,
    save,
  };
}
