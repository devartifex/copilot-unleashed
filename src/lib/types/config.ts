import type { SessionMode, ReasoningEffort } from './common.js';

export interface InfiniteSessionsConfig {
  enabled: boolean;
  backgroundThreshold: number;
  bufferThreshold: number;
}

export type { SystemPromptSection, SectionOverride, SectionOverrideAction } from '@github/copilot-sdk';

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
