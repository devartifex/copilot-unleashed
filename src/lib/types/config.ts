import type { SessionMode, ReasoningEffort } from './common.js';
import type { ModelCapabilitiesOverride } from '@github/copilot-sdk';

export interface InfiniteSessionsConfig {
  enabled: boolean;
  backgroundThreshold: number;
  bufferThreshold: number;
}

export type { SystemMessageSection, SectionOverride, SectionOverrideAction } from '@github/copilot-sdk';
export type { ModelCapabilitiesOverride } from '@github/copilot-sdk';

export interface SystemPromptSectionInput {
  action: 'replace' | 'remove' | 'append' | 'prepend';
  content?: string;
}

/** "off" local only, "export" publish events to GitHub, "on" export + remote steering */
export type RemoteSessionMode = 'off' | 'export' | 'on';

export interface NewSessionConfig {
  /** Omitted → the SDK picks its default model */
  model?: string;
  mode?: SessionMode;
  reasoningEffort?: ReasoningEffort;
  customInstructions?: string;
  excludedTools?: string[];
  infiniteSessions?: InfiniteSessionsConfig;
  systemPromptSections?: Record<string, SystemPromptSectionInput>;
  modelCapabilities?: ModelCapabilitiesOverride;
  enableConfigDiscovery?: boolean;
  /** "off" local only, "export" publish events to GitHub, "on" export + remote steering */
  remoteSession?: RemoteSessionMode;
}

export interface CloudSessionConfig {
  model?: string;
  mode?: SessionMode;
  reasoningEffort?: ReasoningEffort;
  repository?: { owner: string; name: string; branch?: string };
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
  /**
   * Per-user default for cloud/remote session publishing.
   * - "off": local-only (default), no remote visibility.
   * - "export": stream events to GitHub for monitor-only view on github.com/Mobile.
   * - "on": full remote monitor + steer via github.com/Mobile.
   * The active client only honors this when ENABLE_REMOTE_SESSIONS is enabled server-side.
   */
  remoteSession?: RemoteSessionMode;
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
