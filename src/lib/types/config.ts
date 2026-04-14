import type { SessionMode, ReasoningEffort } from './common.js';
import type { ModelCapabilitiesOverride } from '@github/copilot-sdk';

export interface InfiniteSessionsConfig {
  enabled: boolean;
  backgroundThreshold: number;
  bufferThreshold: number;
}

export type { SystemPromptSection, SectionOverride, SectionOverrideAction } from '@github/copilot-sdk';
export type { ModelCapabilitiesOverride } from '@github/copilot-sdk';

export interface SystemPromptSectionInput {
  action: 'replace' | 'remove' | 'append' | 'prepend';
  content?: string;
}

export interface NewSessionConfig {
  model: string;
  mode?: SessionMode;
  reasoningEffort?: ReasoningEffort;
  customInstructions?: string;
  excludedTools?: string[];
  infiniteSessions?: InfiniteSessionsConfig;
  systemPromptSections?: Record<string, SystemPromptSectionInput>;
  modelCapabilities?: ModelCapabilitiesOverride;
  enableConfigDiscovery?: boolean;
}

export interface PersistedSettings {
  model: string;
  mode: SessionMode;
  reasoningEffort: ReasoningEffort;
  additionalInstructions: string;
  excludedTools: string[];
  infiniteSessions?: InfiniteSessionsConfig;
  /** User preference for push notifications — persisted so it survives redeploys. */
  notificationsEnabled?: boolean;
  /** User preference for voice input — show/hide the microphone button. */
  voiceInputEnabled?: boolean;
  /** User preference for text-to-speech — show/hide the read aloud button. */
  ttsEnabled?: boolean;
  /** TTS speech rate (0.5 to 2.0). */
  ttsRate?: number;
}

export interface CustomAgentDefinition {
  name: string;
  displayName?: string;
  description?: string;
  tools?: string[];
  prompt: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  directory: string;
  license?: string;
  allowedTools?: string;
}
