export type CustomizationSource = 'builtin' | 'user' | 'repo';

export interface SourcedAgentInfo {
  name: string;
  displayName?: string;
  description?: string;
  source: CustomizationSource;
  isSelected: boolean;
}

export interface SourcedSkillInfo {
  name: string;
  description: string;
  source: CustomizationSource;
  enabled: boolean;
  userInvocable?: boolean;
  path?: string;
}

export interface SourcedMcpServerInfo {
  name: string;
  source: CustomizationSource;
  status: string;
  type?: string;
  url?: string;
  command?: string;
  error?: string;
}

export interface InstructionInfo {
  name: string;
  source: CustomizationSource;
  path: string;
  description?: string;
  applyTo?: string;
}

export interface PromptInfo {
  name: string;
  source: CustomizationSource;
  path: string;
  description: string;
  content: string;
}
