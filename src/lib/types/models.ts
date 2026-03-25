import type { ReasoningEffort } from './common.js';

export interface ModelCapabilities {
  limits?: {
    max_context_window_tokens?: number;
    max_prompt_tokens?: number;
  };
  supports?: {
    vision?: boolean;
    reasoningEffort?: boolean;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  billing?: { multiplier: number };
  capabilities?: ModelCapabilities;
  defaultReasoningEffort?: ReasoningEffort;
  supportedReasoningEfforts?: string[];
}
